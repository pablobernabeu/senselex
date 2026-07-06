// Pure functions that turn raw ratings and elicitation responses into the norms
// the programme cares about. Everything here is deterministic and side-effect
// free so that it can be unit tested against known values and reused unchanged
// on the server, in the offline client, and in batch re-analysis.

import {
  PERCEPTUAL_DIMENSIONS,
  ALL_DIMENSIONS,
} from './dimensions.js';

function mean(values) {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

// Average each dimension across a set of per-participant rating vectors.
// Each vector is an object keyed by dimension name with values in 0..5.
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

// The dominant modality is the perceptual channel with the greatest mean
// strength. Ties resolve to the earlier channel in the canonical order, which
// keeps the result stable across runs.
export function dominantModality(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  let best = null;
  let bestValue = -Infinity;
  for (const dimension of dimensions) {
    const value = averaged[dimension] ?? 0;
    if (value > bestValue) {
      bestValue = value;
      best = dimension;
    }
  }
  return { modality: best, strength: bestValue === -Infinity ? 0 : bestValue };
}

// Maximum perceptual strength predicts lexical processing better than
// concreteness or imageability (Lynott et al., 2020), so it is reported in its
// own right.
export function maximumPerceptualStrength(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  return dominantModality(averaged, dimensions).strength;
}

// Modality exclusivity (Lynott & Connell, 2009): the range of strengths divided
// by their sum, across the perceptual channels. It runs from 0, when a word is
// experienced equally through every channel, to 1, when it is experienced
// through a single channel only.
export function modalityExclusivity(averaged, dimensions = PERCEPTUAL_DIMENSIONS) {
  const values = dimensions.map((dimension) => averaged[dimension] ?? 0);
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

// Simpson's index of diversity over a set of categorical responses (the distinct
// names a community gives a stimulus). It is the probability that two responses
// drawn at random name the stimulus differently. Lower diversity means higher
// agreement, which Majid and colleagues treat as one component of codability.
// The unbiased, sampling-without-replacement form is used.
export function simpsonDiversity(responseCounts) {
  const counts = Object.values(responseCounts);
  let total = 0;
  for (const count of counts) total += count;
  if (total < 2) return 0;
  let sameTypePairs = 0;
  for (const count of counts) sameTypePairs += count * (count - 1);
  const probabilitySame = sameTypePairs / (total * (total - 1));
  return 1 - probabilitySame;
}

// Agreement is the complement of diversity: the probability that two responses
// match. Reported alongside diversity so neither has to be inverted by hand.
export function agreement(responseCounts) {
  const total = Object.values(responseCounts).reduce((sum, count) => sum + count, 0);
  if (total < 2) return total === 0 ? 0 : 1;
  return 1 - simpsonDiversity(responseCounts);
}

function tally(items) {
  const counts = {};
  for (const item of items) {
    const key = String(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Codability of a stimulus from its free-naming responses. Each response carries
// a name, an utterance length in tokens, and a coded type. The three classic
// components are returned together: agreement (from name diversity), brevity
// (mean utterance length), and abstractness (the share of abstract responses).
export function codability(responses) {
  const names = responses.map((response) => response.name);
  const lengths = responses.map((response) => response.length ?? 0);
  const types = responses.map((response) => response.responseType);
  const nameCounts = tally(names);
  const typeCounts = tally(types);
  const total = responses.length;

  const proportions = {};
  for (const [type, count] of Object.entries(typeCounts)) {
    proportions[type] = count / total;
  }

  return {
    n: total,
    diversity: simpsonDiversity(nameCounts),
    agreement: agreement(nameCounts),
    meanUtteranceLength: mean(lengths),
    distinctNames: Object.keys(nameCounts).length,
    responseTypeProportions: proportions,
  };
}
