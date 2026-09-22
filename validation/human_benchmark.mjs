// Three analyses of the Lancaster Sensorimotor Norms at the level of individual
// ratings. None needs participants or ethical review: all reuse the trial-level
// data the authors publish (Lynott et al., 2020; osf.io/7emr6, Data component).
//
// 1. RAW-TO-NORM REPRODUCTION. criterion.mjs checks that SenseLex computes the
//    derived measures (maximum strength, exclusivity, dominant modality) from the
//    published means. This goes one step further back. It groups every
//    participant's ratings into the per-word vectors SenseLex itself would
//    receive, passes them through the suite's own averageRatings, and compares the
//    result with the published per-dimension means. That tests the aggregation
//    step on the data it was built for, human ratings, across the whole lexicon.
//
// 2. HUMAN RELIABILITY BENCHMARK. Single-rater reliability per dimension,
//    computed with the same function (stats.mjs) that compute.mjs applies to the
//    machine panel, on the same 300 words. The machine panel's internal agreement
//    can then be set against a measured human figure instead of a cited one.
//
// 3. RATERS-PER-WORD DESIGN TABLE. Single-rater reliability over the whole
//    lexicon, stepped up with Spearman-Brown to the number of raters a new norming
//    study needs for a target reliability, and checked directly against the data
//    at several panel sizes so that the formula is not taken on trust.
//
// Run from the software directory:
//   node --max-old-space-size=6144 validation/human_benchmark.mjs
// Reads lancaster-trial-ratings.csv and lancaster-sensorimotor-norms.csv from
// SENSELEX_DATA_DIR (default: validation/). The trial file is about 1.4 GB, so
// keep it outside any folder a cloud client synchronises. Its SHA-256 is checked
// against the value OSF publishes before anything is computed.
// Writes validation/human-benchmark-results.json.

import process from 'node:process';
import { createReadStream, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { averageRatings, maximumPerceptualStrength, modalityExclusivity } from '../src/domain/norms.js';
import { PERCEPTUAL_DIMENSIONS, ACTION_DIMENSIONS, ALL_DIMENSIONS } from '../src/domain/dimensions.js';
import { singleRaterReliability, reliabilityOfMeans, spearmanBrown, ratersFor, pearson, mean, mulberry32, shuffleInPlace } from './stats.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.SENSELEX_DATA_DIR || here;
const TRIAL = resolve(dataDir, 'lancaster-trial-ratings.csv');
const NORMS = resolve(dataDir, 'lancaster-sensorimotor-norms.csv');
// Published by OSF for Individual_participant_ratings_all_items_..._UPDATED.csv.
const TRIAL_SHA256 = '3f418ae3a8234a8377f1a6c4cac1afd7ea3e5bd481705fe407997617d3ee7a65';
const TRIAL_URL = 'https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/667d8a53f112ce02e78a6034';

for (const [path, fetch] of [[TRIAL, `curl -L -o "${TRIAL}" "${TRIAL_URL}"`], [NORMS, 'see criterion.mjs']]) {
  if (!existsSync(path)) {
    process.stderr.write(`Missing ${path}\nFetch with: ${fetch}\n`);
    process.exit(1);
  }
}

// Lancaster's column names for the same eleven channels.
const DIM_OF = {
  Haptic: 'touch', Auditory: 'hearing', Olfactory: 'smell', Gustatory: 'taste',
  Visual: 'vision', Interoceptive: 'interoception', Mouth: 'mouth_throat',
  Hand_arm: 'hand_arm', Foot_leg: 'foot_leg', Head: 'head', Torso: 'torso',
};
const COLUMN_OF = Object.fromEntries(Object.entries(DIM_OF).map(([k, v]) => [v, k]));

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

process.stdout.write('Checking the trial file against the published checksum...\n');
const digest = await sha256(TRIAL);
if (digest !== TRIAL_SHA256) {
  process.stderr.write(`Checksum mismatch: got ${digest}\nexpected ${TRIAL_SHA256}\n`);
  process.exit(1);
}
process.stdout.write('  matches\n');

// ---- Read the trial data into per-response vectors --------------------------
//
// One row per participant, word and dimension. A rating of NA means the
// participant did not know the word; SenseLex never receives such a rating, so
// the vector is dropped rather than passed through as blanks.

process.stdout.write('Reading the trial data...\n');
const vectors = new Map(); // word -> Map(responseId -> {component, dims})
let rows = 0;
let unknown = 0;
const reader = createInterface({ input: createReadStream(TRIAL), crlfDelay: Infinity });
let header = null;
for await (const line of reader) {
  if (!header) { header = line.split(','); continue; }
  const c = line.split(',');
  const word = c[2].trim();
  const dimName = c[3];
  if (dimName === 'Dont_know_word') continue;
  const dim = DIM_OF[dimName];
  if (!dim) continue;
  rows += 1;
  const response = c[1];
  let byResponse = vectors.get(word);
  if (!byResponse) { byResponse = new Map(); vectors.set(word, byResponse); }
  let v = byResponse.get(response);
  if (!v) { v = { component: c[7], dims: {} }; byResponse.set(response, v); }
  if (c[4] === 'NA') { v.unknown = true; unknown += 1; continue; }
  v.dims[dim] = Number(c[4]);
}
process.stdout.write(`  ${rows.toLocaleString()} ratings, ${vectors.size.toLocaleString()} words, ${unknown.toLocaleString()} marked unknown\n`);

// Known-word vectors for one word and one component.
function known(word, component) {
  const byResponse = vectors.get(word);
  if (!byResponse) return [];
  const out = [];
  for (const v of byResponse.values()) if (v.component === component && !v.unknown) out.push(v.dims);
  return out;
}

// ---- Published norms ---------------------------------------------------------

const normLines = readFileSync(NORMS, 'utf8').split(/\r?\n/).filter(Boolean);
const nh = normLines[0].split(',');
const ni = Object.fromEntries(nh.map((h, i) => [h, i]));
const published = new Map();
// The published file carries a few words with trailing whitespace that the trial
// file does not; they are matched after trimming and listed, since a naive join
// would silently drop them.
const paddedInPublished = [];
for (const line of normLines.slice(1)) {
  const c = line.split(',');
  const means = {};
  for (const d of ALL_DIMENSIONS) means[d] = Number(c[ni[`${COLUMN_OF[d]}.mean`]]);
  if (c[0] !== c[0].trim()) paddedInPublished.push(c[0]);
  published.set(c[0].trim(), means);
}

// ---- 1. Raw-to-norm reproduction --------------------------------------------

process.stdout.write('Reproducing the published means from individual ratings...\n');
let compared = 0;
let exact = 0;
const failures = [];
const TOLERANCE = 1e-6; // the published means carry nine or ten significant figures
for (const [word, pub] of published) {
  const perceptionVectors = known(word, 'Perception');
  const actionVectors = known(word, 'Action');
  const ours = {
    ...averageRatings(perceptionVectors, PERCEPTUAL_DIMENSIONS),
    ...averageRatings(actionVectors, ACTION_DIMENSIONS),
  };
  let worstHere = 0;
  let worstDim = null;
  for (const d of ALL_DIMENSIONS) {
    const delta = ours[d] === null ? Infinity : Math.abs(ours[d] - pub[d]);
    if (delta > worstHere) { worstHere = delta; worstDim = d; }
  }
  compared += 1;
  if (worstHere <= TOLERANCE) exact += 1;
  else {
    failures.push({
      word, dimension: worstDim, ours: ours[worstDim], published: pub[worstDim], difference: worstHere,
      knownRaters: { perception: perceptionVectors.length, action: actionVectors.length },
    });
  }
}
failures.sort((a, b) => b.difference - a.difference);
const worst = failures.length ? failures[0].difference : 0;
const inTrialNotPublished = [...vectors.keys()].filter((w) => !published.has(w)).length;
process.stdout.write(`  ${exact.toLocaleString()} of ${compared.toLocaleString()} words reproduce on all eleven means; ${failures.length} differ (largest ${worst.toExponential(2)})\n`);
if (paddedInPublished.length) {
  process.stdout.write(`  published words with trailing whitespace, matched after trimming: ${paddedInPublished.map((w) => JSON.stringify(w)).join(', ')}\n`);
}
process.stdout.write(`  ${inTrialNotPublished} words in the trial data are absent from the published norms (the low-N-known exclusions)\n`);

// ---- 2. Human reliability on the panel's words -----------------------------

const sample = JSON.parse(readFileSync(resolve(here, 'words-sample.json'), 'utf8')).items;
const component = (d) => (PERCEPTUAL_DIMENSIONS.includes(d) ? 'Perception' : 'Action');

function ratingsByWord(words, dimension) {
  return words.map((w) => known(w, component(dimension)).map((v) => v[dimension]).filter((x) => typeof x === 'number'));
}

process.stdout.write('Human single-rater reliability on the 300 panel words (half size 6, as for the machine panel)...\n');
const panelWords = sample.map((i) => i.word.toUpperCase());
const humanOnSample = {};
for (const d of ALL_DIMENSIONS) {
  const byWord = ratingsByWord(panelWords, d);
  const rel = singleRaterReliability(byWord, { halfSize: 6 });
  // The published means rest on each word's own number of known raters, so their
  // reliability follows from the single-rater value and the harmonic mean count.
  const means = reliabilityOfMeans(rel.r1, byWord.map((r) => r.length));
  humanOnSample[d] = { ...rel, reliabilityOfPublishedMeans: means.reliability, harmonicRaters: means.harmonicRaters };
  process.stdout.write(`  ${d.padEnd(14)} r1 = ${rel.r1.toFixed(3)}  published means reliability = ${means.reliability.toFixed(3)} (harmonic ${means.harmonicRaters.toFixed(1)} raters, ${rel.words} words)\n`);
}

// ---- 3. Raters-per-word design table ---------------------------------------

process.stdout.write('Single-rater reliability over the whole lexicon, and the raters it implies...\n');
const lexicon = [...published.keys()];
const design = {};
for (const d of ALL_DIMENSIONS) {
  const byWord = ratingsByWord(lexicon, d);
  const rel = singleRaterReliability(byWord, { halfSize: 8, splits: 50 });
  // A direct check of the Spearman-Brown projection: correlate the means of two
  // disjoint groups of k raters across words, which estimates the reliability of
  // a k-rater mean without the formula.
  const rand = mulberry32(20260923);
  const empirical = {};
  for (const k of [2, 4, 6, 10]) {
    const a = [];
    const b = [];
    for (const ratings of byWord) {
      if (ratings.length < 2 * k) continue;
      const pool = shuffleInPlace([...ratings], rand);
      a.push(mean(pool.slice(0, k)));
      b.push(mean(pool.slice(k, 2 * k)));
    }
    empirical[k] = { observed: pearson(a, b), predicted: spearmanBrown(rel.r1, k), words: a.length };
  }
  design[d] = {
    r1: rel.r1,
    words: rel.words,
    ratersFor80: ratersFor(rel.r1, 0.8),
    ratersFor90: ratersFor(rel.r1, 0.9),
    reliabilityAt: Object.fromEntries([5, 10, 15, 20].map((k) => [k, spearmanBrown(rel.r1, k)])),
    empiricalCheck: empirical,
  };
  process.stdout.write(`  ${d.padEnd(14)} r1 = ${rel.r1.toFixed(3)}  raters for .80: ${design[d].ratersFor80}, for .90: ${design[d].ratersFor90}  (k=4 observed ${empirical[4].observed.toFixed(3)} vs predicted ${empirical[4].predicted.toFixed(3)}; k=10 ${empirical[10].observed.toFixed(3)} vs ${empirical[10].predicted.toFixed(3)})\n`);
}

// The derived measures a study reports also depend on panel size, so the table
// includes how closely the maximum strength and exclusivity of a k-rater panel
// track the full-panel values, on the panel words.
function derivedAtK(k, seed) {
  const rand = mulberry32(seed);
  const small = [];
  const full = [];
  for (const w of panelWords) {
    const p = known(w, 'Perception');
    if (p.length < k + 2) continue;
    const pool = shuffleInPlace([...p], rand);
    small.push(averageRatings(pool.slice(0, k), PERCEPTUAL_DIMENSIONS));
    full.push(averageRatings(pool.slice(k), PERCEPTUAL_DIMENSIONS));
  }
  return {
    k,
    words: small.length,
    maxStrength: pearson(small.map((v) => maximumPerceptualStrength(v)), full.map((v) => maximumPerceptualStrength(v))),
    exclusivity: pearson(small.map((v) => modalityExclusivity(v) ?? 0), full.map((v) => modalityExclusivity(v) ?? 0)),
  };
}
const derivedCurve = [3, 5, 8, 10, 12].map((k) => derivedAtK(k, 20260923 + k));

const results = {
  source: {
    dataset: 'Lancaster Sensorimotor Norms, trial-level ratings (Lynott et al., 2020)',
    file: 'Individual_participant_ratings_all_items_sensorimotor_norms_for_39954_words.UPDATED.csv',
    sha256: TRIAL_SHA256,
    osf: 'https://osf.io/rwhs6/',
  },
  reproduction: {
    wordsCompared: compared,
    wordsReproducingAllEleven: exact,
    wordsDiffering: failures.length,
    largestDifference: worst,
    differences: failures,
    publishedWordsWithTrailingWhitespace: paddedInPublished,
    tolerance: TOLERANCE,
    trialWordsAbsentFromPublished: inTrialNotPublished,
    ratingsRead: rows,
    unknownRatings: unknown,
  },
  humanReliabilityOnPanelWords: humanOnSample,
  designTable: design,
  derivedMeasuresBySubsample: derivedCurve,
};
writeFileSync(resolve(here, 'human-benchmark-results.json'), `${JSON.stringify(results, null, 2)}\n`);
process.stdout.write('Wrote human-benchmark-results.json\n');
