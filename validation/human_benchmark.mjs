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
//    computed with the same function (stats.mjs) that the machine panel's is
//    computed with: on the confirmatory words, as PREDICTIONS.md specifies for
//    H2 and H1b, and descriptively on all 300 panel words. The machine panel's
//    internal agreement can then be set against a measured human figure instead
//    of a cited one.
//
// 3. RATERS-PER-WORD DESIGN TABLE. Single-rater reliability over the whole
//    lexicon, stepped up with Spearman-Brown to the number of raters a new norming
//    study needs for a target reliability, and checked directly against the data
//    at several panel sizes so that the formula is not taken on trust.
//
// Run from the repository root:
//   node --max-old-space-size=6144 validation/human_benchmark.mjs
// Reads validation/words-sample.json, validation/raters.json (for the word sets
// of H2 and H1b) and lancaster-trial-ratings.csv and lancaster-sensorimotor-norms.csv
// from SENSELEX_DATA_DIR (default: validation/). The trial file is about 1.4 GB, so
// keep it outside any folder a cloud client synchronises. Both files are checked
// against the SHA-256 that OSF publishes before anything is computed
// (lancaster.mjs).
// Writes validation/human-benchmark-results.json.

import process from 'node:process';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { averageRatings, maximumPerceptualStrength, modalityExclusivity } from '../src/domain/norms.js';
import { PERCEPTUAL_DIMENSIONS, ACTION_DIMENSIONS, ALL_DIMENSIONS } from '../src/domain/dimensions.js';
import { SEED, singleRaterReliability, reliabilityOfMeans, spearmanBrown, ratersFor, pearson, mean, mulberry32, shuffleInPlace } from './stats.mjs';
import { LANCASTER_FILES, verifiedLancasterPath, readNormsCsv, columnIndex } from './lancaster.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// Lancaster's column names for the same eleven channels.
const DIM_OF = {
  Haptic: 'touch', Auditory: 'hearing', Olfactory: 'smell', Gustatory: 'taste',
  Visual: 'vision', Interoceptive: 'interoception', Mouth: 'mouth_throat',
  Hand_arm: 'hand_arm', Foot_leg: 'foot_leg', Head: 'head', Torso: 'torso',
};
const COLUMN_OF = Object.fromEntries(Object.entries(DIM_OF).map(([k, v]) => [v, k]));

process.stdout.write('Checking both files against their published checksums...\n');
const TRIAL = await verifiedLancasterPath('trial');
const NORMS = await verifiedLancasterPath('norms');
process.stdout.write('  both match\n');

// ---- Read the trial data into per-response vectors --------------------------
//
// One row per participant, word and dimension. A rating of NA means the
// participant did not know the word; SenseLex never receives such a rating, so
// the vector is dropped, not passed through as blanks.
//
// The file has no quoted fields, so a plain split on commas is safe and several
// times faster than a full CSV parser over 10 million lines. A line with a quote
// would break that, so it stops the run, as does an empty or non-numeric rating,
// which Number() would otherwise read as 0 or NaN without complaint.

process.stdout.write('Reading the trial data...\n');
const vectors = new Map(); // word -> Map(responseId -> {component, dims})
let rows = 0;
let unknown = 0;
const reader = createInterface({ input: createReadStream(TRIAL), crlfDelay: Infinity });
let col = null;
for await (const line of reader) {
  if (!col) {
    col = columnIndex(line.split(','), ['response_ID', 'Word', 'Dimension', 'Rating', 'Norming_Component']);
    continue;
  }
  if (line.includes('"')) throw new Error(`Quoted field in ${LANCASTER_FILES.trial.local}: ${line}`);
  const c = line.split(',');
  const word = c[col.Word].trim();
  const dimName = c[col.Dimension];
  if (dimName === 'Dont_know_word') continue;
  const dim = DIM_OF[dimName];
  if (!dim) continue;
  rows += 1;
  const response = c[col.response_ID];
  let byResponse = vectors.get(word);
  if (!byResponse) { byResponse = new Map(); vectors.set(word, byResponse); }
  let v = byResponse.get(response);
  if (!v) { v = { component: c[col.Norming_Component], dims: {} }; byResponse.set(response, v); }
  const rating = c[col.Rating];
  if (rating === 'NA') { v.unknown = true; unknown += 1; continue; }
  const value = Number(rating);
  if (rating === '' || !Number.isFinite(value)) throw new Error(`Rating "${rating}" for ${word} (${dimName}) is not a number`);
  v.dims[dim] = value;
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

const normsCsv = readNormsCsv(NORMS);
const ni = columnIndex(normsCsv.header, ['Word', ...ALL_DIMENSIONS.map((d) => `${COLUMN_OF[d]}.mean`)]);
const published = new Map();
// The published file carries a few words with trailing whitespace that the trial
// file does not; they are matched after trimming and listed, since a naive join
// would silently drop them.
const paddedInPublished = [];
for (const c of normsCsv.rows) {
  const word = c[ni.Word];
  const means = {};
  for (const d of ALL_DIMENSIONS) means[d] = Number(c[ni[`${COLUMN_OF[d]}.mean`]]);
  if (word !== word.trim()) paddedInPublished.push(word);
  if (published.has(word.trim())) throw new Error(`Two published rows share the word ${word.trim()}`);
  published.set(word.trim(), means);
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

// Where a word's published means do not match its own ratings, check whether they
// match another word's ratings exactly. A published row that reproduces some
// other word's ratings to within tolerance points to values attached to the
// wrong item, not to any difference in how the means were computed. Each
// component is checked separately, since perception and action were rated by
// different participants and merged afterwards.
function componentMeans(word, component, dims) {
  return averageRatings(known(word, component), dims);
}
const matchIndex = { Perception: new Map(), Action: new Map() };
const keyOf = (means, dims) => dims.map((d) => (means[d] === null ? 'x' : means[d].toFixed(5))).join('|');
for (const word of vectors.keys()) {
  matchIndex.Perception.set(keyOf(componentMeans(word, 'Perception', PERCEPTUAL_DIMENSIONS), PERCEPTUAL_DIMENSIONS), word);
  matchIndex.Action.set(keyOf(componentMeans(word, 'Action', ACTION_DIMENSIONS), ACTION_DIMENSIONS), word);
}
for (const f of failures) {
  const pub = published.get(f.word);
  const pubP = keyOf(pub, PERCEPTUAL_DIMENSIONS);
  const pubA = keyOf(pub, ACTION_DIMENSIONS);
  const ownP = keyOf(componentMeans(f.word, 'Perception', PERCEPTUAL_DIMENSIONS), PERCEPTUAL_DIMENSIONS);
  const ownA = keyOf(componentMeans(f.word, 'Action', ACTION_DIMENSIONS), ACTION_DIMENSIONS);
  f.perception = pubP === ownP ? 'matches own ratings' : (matchIndex.Perception.get(pubP) ? `matches ${matchIndex.Perception.get(pubP)}` : 'matches no word');
  f.action = pubA === ownA ? 'matches own ratings' : (matchIndex.Action.get(pubA) ? `matches ${matchIndex.Action.get(pubA)}` : 'matches no word');
}
const matchesAnother = (status) => status !== 'matches own ratings' && status !== 'matches no word';
const displaced = failures.filter((f) => matchesAnother(f.perception) || matchesAnother(f.action));
const inTrialNotPublished = [...vectors.keys()].filter((w) => !published.has(w)).length;
process.stdout.write(`  ${exact.toLocaleString()} of ${compared.toLocaleString()} words reproduce on all eleven means; ${failures.length} differ (largest ${worst.toExponential(2)})\n`);
process.stdout.write(`  of those, ${displaced.length} have published means that reproduce another word's ratings exactly
`);
for (const f of displaced.slice(0, 12)) process.stdout.write(`    ${f.word}: perception ${f.perception}; action ${f.action}
`);
if (paddedInPublished.length) {
  process.stdout.write(`  published words with trailing whitespace, matched after trimming: ${paddedInPublished.map((w) => JSON.stringify(w)).join(', ')}\n`);
}
process.stdout.write(`  ${inTrialNotPublished} words in the trial data are absent from the published norms (excluded by the authors for having fewer than ten valid ratings on a component; Lynott et al., 2020)\n`);

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

// ---- 2b. The same, on the preregistered word set ----------------------------
//
// PREDICTIONS.md runs every test on the 246 confirmatory words unless it says
// otherwise, and computes H2 for both panels on the same words. Split halves of
// six need twelve ratings, so each channel's word set is the confirmatory words
// with at least twelve known human ratings and at least twelve machine ratings;
// the machine panel falls short of twelve only where a rater marked a word
// unknown. criterion.mjs computes the machine value on exactly the words listed
// here. The published means' reliability, used by H1b, is stepped up to the
// harmonic mean of the known-rater counts over all 246 confirmatory words, since
// those are the means its correlations use.
const panelRatings = JSON.parse(readFileSync(resolve(here, 'raters.json'), 'utf8'));
const machineCount = new Map(); // word -> { channel: number of machine ratings }
for (const rater of panelRatings.raters) {
  for (const r of rater.ratings) {
    if (r.dont_know) continue;
    const counts = machineCount.get(r.word) ?? {};
    for (const d of ALL_DIMENSIONS) if (typeof r[d] === 'number') counts[d] = (counts[d] ?? 0) + 1;
    machineCount.set(r.word, counts);
  }
}
const confirmatoryWords = sample.filter((i) => i.set === 'confirmatory').map((i) => i.word);
process.stdout.write(`Human single-rater reliability on the ${confirmatoryWords.length} confirmatory words, as preregistered for H2 and H1b...\n`);
const humanOnConfirmatory = {};
for (const d of ALL_DIMENSIONS) {
  const humanRatings = (w) => ratingsByWord([w.toUpperCase()], d)[0];
  const wordSet = confirmatoryWords.filter((w) => humanRatings(w).length >= 12 && (machineCount.get(w)?.[d] ?? 0) >= 12);
  const rel = singleRaterReliability(wordSet.map(humanRatings), { halfSize: 6 });
  const means = reliabilityOfMeans(rel.r1, confirmatoryWords.map((w) => humanRatings(w).length));
  humanOnConfirmatory[d] = { ...rel, reliabilityOfPublishedMeans: means.reliability, harmonicRaters: means.harmonicRaters, wordSet };
  process.stdout.write(`  ${d.padEnd(14)} r1 = ${rel.r1.toFixed(3)} on ${rel.words} words  published means reliability = ${means.reliability.toFixed(3)}\n`);
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
  const rand = mulberry32(SEED);
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
  // Exclusivity is undefined (null) when fewer than two channels were rated. Such
  // a pair is left out: reading it as 0 would treat "not measured" as "equally
  // experienced through every channel".
  const exclusivityPairs = small
    .map((v, i) => [modalityExclusivity(v), modalityExclusivity(full[i])])
    .filter(([a, b]) => a !== null && b !== null);
  return {
    k,
    words: small.length,
    maxStrength: pearson(small.map((v) => maximumPerceptualStrength(v)), full.map((v) => maximumPerceptualStrength(v))),
    exclusivity: pearson(exclusivityPairs.map((p) => p[0]), exclusivityPairs.map((p) => p[1])),
  };
}
const derivedCurve = [3, 5, 8, 10, 12].map((k) => derivedAtK(k, SEED + k));

const results = {
  source: {
    dataset: 'Lancaster Sensorimotor Norms, trial-level ratings (Lynott et al., 2020)',
    file: LANCASTER_FILES.trial.osfName,
    sha256: LANCASTER_FILES.trial.sha256,
    osf: 'https://osf.io/rwhs6/',
  },
  reproduction: {
    wordsCompared: compared,
    wordsReproducingAllEleven: exact,
    wordsDiffering: failures.length,
    largestDifference: worst,
    differences: failures,
    wordsWhosePublishedMeansMatchAnotherWord: displaced.length,
    publishedWordsWithTrailingWhitespace: paddedInPublished,
    tolerance: TOLERANCE,
    trialWordsAbsentFromPublished: inTrialNotPublished,
    ratingsRead: rows,
    unknownRatings: unknown,
  },
  humanReliabilityOnPanelWords: humanOnSample,
  humanReliabilityOnConfirmatoryWords: humanOnConfirmatory,
  designTable: design,
  derivedMeasuresBySubsample: derivedCurve,
};
writeFileSync(resolve(here, 'human-benchmark-results.json'), `${JSON.stringify(results, null, 2)}\n`);
process.stdout.write('Wrote human-benchmark-results.json\n');
