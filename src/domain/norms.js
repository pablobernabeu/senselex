// Pure functions that turn raw ratings and elicitation responses into the norms
// the programme cares about. Everything here is deterministic and side-effect
// free so that it can be unit tested against known values and reused unchanged
// on the server, in the offline client, and in batch re-analysis.

import {
  PERCEPTUAL_DIMENSIONS,
  ALL_DIMENSIONS,
} from './dimensions.js';

function mean(values) {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

// A channel nobody rated is not a channel rated zero. In the Lancaster protocol
// zero is a substantive judgement ("not experienced at all through this
// channel"), so collapsing an absent judgement onto it would invent data. The
// rating form allows partial vectors, so this case is common rather than
// exotic, and it matters: modality exclusivity is a range over a sum, so an
// absent channel read as zero drives the minimum to zero and shrinks the
// denominator at once, inflating the score. Absent channels are therefore null
// here and are skipped by every function below.
function ratedValue(averaged, dimension) {
  const value = averaged[dimension];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Average each dimension across a set of per-participant rating vectors. Each
// vector is an object keyed by dimension name with values in 0..5. A dimension
// no vector filled averages to null rather than to zero.
export function averageRatings(vectors, dimensions = ALL_DIMENSIONS) {
  const result = {};
  for (const dimension of dimensions) {
    const column = [];
    for (const vector of vectors) {
      const value = vector[dimension];
      if (typeof value === 'number' && Number.isFinite(value)) column.push(value);
    }
    result[dimension] = mean(column);
  }
  return result;
}

// How many raters supplied a judgement on each dimension. Partial vectors mean
// the dimensions of one word can rest on different numbers of raters, so a
// single record count would misdescribe the means. Downstream consumers need
// these to recompute any reliability statistic, so exports carry them.
export function ratedCounts(vectors, dimensions = ALL_DIMENSIONS) {
  const result = {};
  for (const dimension of dimensions) {
    let n = 0;
    for (const vector of vectors) {
      const value = vector[dimension];
      if (typeof value === 'number' && Number.isFinite(value)) n += 1;
    }
    result[dimension] = n;
  }
  return result;
}

// The dominant modality is the perceptual channel with the greatest mean
// strength, among the channels that were actually rated. Ties resolve to the
// earlier channel in the canonical order, which keeps the result stable across
// runs. A word with no rated perceptual channel, or one rated at zero
// throughout, has no dominant modality and reports null rather than defaulting
// to whichever channel happens to sort first.
export function dominantModality(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  let best = null;
  let bestValue = null;
  for (const dimension of dimensions) {
    const value = ratedValue(averaged, dimension);
    if (value === null) continue;
    if (bestValue === null || value > bestValue) {
      bestValue = value;
      best = dimension;
    }
  }
  if (bestValue === null || bestValue === 0) return { modality: null, strength: bestValue };
  return { modality: best, strength: bestValue };
}

// Maximum perceptual strength predicts lexical processing better than
// concreteness or imageability (Connell & Lynott, 2012, over five modalities),
// so it is reported in its own right.
export function maximumPerceptualStrength(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  return dominantModality(averaged, dimensions).strength;
}

// Modality exclusivity: the range of strengths divided by their sum, across the
// perceptual channels that were rated. It runs from 0, when a word is
// experienced equally through every channel, to 1, when it is experienced
// through a single channel only. Introduced by Lynott and Connell (2009) over
// three modalities and extended to five in Lynott and Connell (2013); the six
// channels used here follow Lynott et al. (2020). Values are not comparable
// across different numbers of channels, so exports record how many channels
// contributed. Fewer than two rated channels leaves the range undefined, which
// returns null rather than a misleading zero.
export function modalityExclusivity(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  const values = [];
  for (const dimension of dimensions) {
    const value = ratedValue(averaged, dimension);
    if (value !== null) values.push(value);
  }
  if (values.length < 2) return null;
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  for (const value of values) {
    if (value > max) max = value;
    if (value < min) min = value;
    sum += value;
  }
  if (sum === 0) return 0;
  return (max - min) / sum;
}

// How many perceptual channels contributed to an exclusivity score. Reported
// beside it because the measure is bounded by the number of channels and so is
// not comparable across sets of different size: a five-modality Dutch norm and
// a six-channel norm computed here are different quantities.
export function ratedChannelCount(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  let n = 0;
  for (const dimension of dimensions) {
    if (ratedValue(averaged, dimension) !== null) n += 1;
  }
  return n;
}

// Simpson's index of diversity (Simpson, 1949) over a set of categorical
// responses, here the distinct names a community gives a stimulus. It is the
// probability that two responses drawn at random name the stimulus
// differently. Lower diversity means higher agreement, which Majid and
// colleagues treat as one component of codability. The unbiased,
// sampling-without-replacement form is used.
//
// Note on naming: Majid and colleagues report this quantity as Simpson's D,
// defined so that a higher value means greater agreement. The value returned
// here is its complement, 1 - D. `agreement` below returns D itself, and that
// is the figure to compare with published codability results.
//
// Fewer than two responses leaves the index undefined: a single response cannot
// agree or disagree with anything, so null is returned rather than a zero that
// would read as perfect diversity.
export function simpsonDiversity(responseCounts) {
  const counts = Object.values(responseCounts);
  let total = 0;
  for (const count of counts) total += count;
  if (total < 2) return null;
  let sameTypePairs = 0;
  for (const count of counts) sameTypePairs += count * (count - 1);
  const probabilitySame = sameTypePairs / (total * (total - 1));
  return 1 - probabilitySame;
}

// Agreement is the complement of diversity: the probability that two responses
// match, which is Simpson's D as the codability literature reports it. Returned
// alongside diversity so neither has to be inverted by hand.
export function agreement(responseCounts) {
  const diversity = simpsonDiversity(responseCounts);
  return diversity === null ? null : 1 - diversity;
}

// Free-naming responses are counted as the same name when they differ only in
// surrounding whitespace or letter case, so that "Smoky" and "smoky" are one
// name rather than two. Case is not contrastive in naming responses in any of
// the shipped languages, and leaving it uncollapsed would inflate the distinct
// name count and depress agreement. Everything else, including diacritics and
// internal punctuation, is left alone, since those distinctions can be lexical.
function normaliseName(value) {
  return String(value).trim().toLowerCase();
}

function tally(items, normalise = (value) => String(value)) {
  const counts = {};
  for (const item of items) {
    const key = normalise(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Codability of a stimulus from its free-naming responses, in the sense
// introduced by Brown and Lenneberg (1954) and operationalised for crosslinguistic
// comparison by Majid and colleagues. Each response carries a name, an utterance
// length, and a coded type. The three components are returned together:
// agreement (from name diversity), brevity (mean utterance length), and
// abstractness (the share of abstract responses).
//
// Length is reported both in whitespace-delimited tokens and in characters.
// Token counts are the convention in the elicitation literature, but whitespace
// tokenisation returns 1 for any response in Mandarin, Japanese or Thai, all of
// which the suite ships, so a character count is carried alongside for
// crosslinguistic comparison.
export function codability(responses) {
  const names = responses.map((response) => response.name);
  const types = responses.map((response) => response.responseType);
  const nameCounts = tally(names, normaliseName);
  const typeCounts = tally(types);
  const total = responses.length;

  const tokenLengths = [];
  const characterLengths = [];
  for (const response of responses) {
    if (typeof response.length === 'number' && Number.isFinite(response.length)) {
      tokenLengths.push(response.length);
    }
    if (typeof response.name === 'string') {
      characterLengths.push(response.name.trim().length);
    }
  }

  const proportions = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    proportions[type] = count / total;
  }

  return {
    n: total,
    diversity: simpsonDiversity(nameCounts),
    agreement: agreement(nameCounts),
    meanUtteranceLength: mean(tokenLengths),
    meanUtteranceCharacters: mean(characterLengths),
    distinctNames: Object.keys(nameCounts).length,
    responseTypeProportions: proportions,
  };
}
