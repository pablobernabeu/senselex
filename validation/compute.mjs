// Compute the validation results from the simulated-rater panel. Every record
// is pushed through the suite's own validator, and every norm through the
// suite's own norm functions, so the study exercises the production code path
// end to end: instrument schema -> validation -> norm computation -> export.
//
// Inputs:  validation/raters.json        (panel output: 12 raters x 60 words)
//          validation/words-sample.json  (the sample, with human concreteness)
// Run:     node validation/compute.mjs   (from the software directory)
// Writes:  validation/results.json
//          validation/senselex-llm-validation-dataset.json  (imports into the app)
//          validation/llm-norms-eng.csv                     (server export format)

import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRating } from '../src/domain/validation.js';
import {
  averageRatings,
  dominantModality,
  maximumPerceptualStrength,
  modalityExclusivity,
} from '../src/domain/norms.js';
import { ALL_DIMENSIONS, PERCEPTUAL_DIMENSIONS } from '../src/domain/dimensions.js';
import { toSensorimotorCsv } from '../src/server/export.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(resolve(here, name), 'utf8'));

const panel = read('raters.json');
const sample = read('words-sample.json');
const conc = new Map(sample.items.map((w) => [w.word, w.concreteness]));
const zipf = new Map(sample.items.map((w) => [w.word, w.zipf]));

const sanitiseId = (w) => w.toUpperCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'ITEM';

// ---- 1. Validate every record through the production validator --------------
const records = [];
let validated = 0;
for (const rater of panel.raters) {
  rater.ratings.forEach((r, i) => {
    const dims = {};
    for (const d of ALL_DIMENSIONS) dims[d] = r[d];
    const value = validateRating({
      clientId: `llmval-${rater.rater}-${i}`,
      languageCode: 'eng',
      conceptId: sanitiseId(r.word),
      word: r.word,
      participantRef: rater.rater,
      ratings: dims,
    });
    validated += 1;
    records.push({ rater: rater.rater, word: r.word, dims: value.ratings });
  });
}

// ---- 2. Norms per word ------------------------------------------------------
const byWord = new Map();
for (const rec of records) {
  if (!byWord.has(rec.word)) byWord.set(rec.word, []);
  byWord.get(rec.word).push(rec.dims);
}
const words = [...byWord.keys()].sort();
const norms = words.map((word) => {
  const vectors = byWord.get(word);
  const avg = averageRatings(vectors, ALL_DIMENSIONS);
  const dom = dominantModality(avg, PERCEPTUAL_DIMENSIONS);
  return {
    word,
    conceptId: sanitiseId(word),
    n: vectors.length,
    mean: avg,
    dominantModality: dom.modality,
    maximumPerceptualStrength: maximumPerceptualStrength(avg, PERCEPTUAL_DIMENSIONS),
    modalityExclusivity: modalityExclusivity(avg, PERCEPTUAL_DIMENSIONS),
    concreteness: conc.get(word),
    zipf: zipf.get(word),
  };
});

// ---- statistics helpers -----------------------------------------------------
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Averages the two middle values at even length rather than taking the upper one.
// The dimension set is odd-sized today, so this is latent, but it would bite the
// moment a dimension is added or the measure is applied to another vector.
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const sd = (xs) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
function pearson(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
const ranks = (xs) => {
  const order = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = rank;
    i = j + 1;
  }
  return out;
};
const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

// ---- 3. Split-half reliability per dimension (Spearman-Brown corrected) -----
const raters = panel.raters.map((r) => r.rater);
const half1 = raters.filter((_, i) => i % 2 === 0);
const half2 = raters.filter((_, i) => i % 2 === 1);
function halfMeans(half, word, dim) {
  const values = records
    .filter((r) => r.word === word && half.includes(r.rater))
    .map((r) => r.dims[dim])
    .filter((v) => typeof v === 'number');
  return mean(values);
}
const reliability = {};
for (const dim of ALL_DIMENSIONS) {
  const a = words.map((w) => halfMeans(half1, w, dim));
  const b = words.map((w) => halfMeans(half2, w, dim));
  const r = pearson(a, b);
  reliability[dim] = { splitHalf: r, spearmanBrown: (2 * r) / (1 + r) };
}
const sbValues = ALL_DIMENSIONS.map((d) => reliability[d].spearmanBrown).sort((a, b) => a - b);

// ---- 4. Mean pairwise inter-rater correlation -------------------------------
const flat = new Map(raters.map((r) => [r, []]));
for (const word of words) {
  for (const dim of ALL_DIMENSIONS) {
    for (const rater of raters) {
      const rec = records.find((r) => r.word === word && r.rater === rater);
      flat.get(rater).push(rec.dims[dim] ?? 0);
    }
  }
}
const pairwise = [];
for (let i = 0; i < raters.length; i += 1) {
  for (let j = i + 1; j < raters.length; j += 1) {
    pairwise.push(pearson(flat.get(raters[i]), flat.get(raters[j])));
  }
}

// ---- 5. Convergence with human concreteness ---------------------------------
const withConc = norms.filter((n) => typeof n.concreteness === 'number');
const mps = withConc.map((n) => n.maximumPerceptualStrength);
const hc = withConc.map((n) => n.concreteness);
const convergence = {
  n: withConc.length,
  pearson_maxPerceptual_vs_concreteness: pearson(mps, hc),
  spearman_maxPerceptual_vs_concreteness: spearman(mps, hc),
  pearson_visionMean_vs_concreteness: pearson(withConc.map((n) => n.mean.vision), hc),
};

// ---- 6. Structure of the norms ----------------------------------------------
const domCounts = {};
for (const n of norms) domCounts[n.dominantModality] = (domCounts[n.dominantModality] || 0) + 1;
const excl = norms.map((n) => n.modalityExclusivity);

const results = {
  design: {
    raters: raters.length,
    words: words.length,
    recordsValidated: validated,
    dimensions: ALL_DIMENSIONS.length,
    ratingsPerCell: raters.length,
  },
  reliability: {
    perDimension: reliability,
    spearmanBrown: {
      min: sbValues[0],
      median: median(sbValues),
      max: sbValues[sbValues.length - 1],
      mean: mean(sbValues),
    },
  },
  interRater: { meanPairwisePearson: mean(pairwise), sd: sd(pairwise) },
  convergence,
  structure: {
    dominantModalityCounts: domCounts,
    visionDominantShare: (domCounts.vision || 0) / norms.length,
    modalityExclusivity: { mean: mean(excl), sd: sd(excl), min: Math.min(...excl), max: Math.max(...excl) },
  },
};

// ---- 7. Artefacts -----------------------------------------------------------
// A fixed stamp rather than the wall clock, so re-running the script reproduces
// the artefacts byte for byte and a reader can verify them. Stamping Date.now()
// rewrote all 720 records on every run, which buried any real change in noise.
// Override with SENSELEX_VALIDATION_TIMESTAMP when generating a new panel.
const now = Number(process.env.SENSELEX_VALIDATION_TIMESTAMP ?? Date.parse('2026-07-17T00:00:00Z'));
const dataset = {
  version: 5,
  languages: [{ code: 'eng', name: 'English', script: 'Latin', direction: 'ltr', family: 'Indo-European' }],
  items: sample.items.map((w) => ({
    language: 'eng', conceptId: sanitiseId(w.word), gloss: w.word, word: w.word,
    concreteness: w.concreteness >= 3.5 ? 'high' : w.concreteness <= 2.5 ? 'low' : 'medium',
    concretenessValue: w.concreteness, frequency: w.zipf,
  })),
  ratings: records.map((r, i) => ({
    id: `llmval-${r.rater}-${sanitiseId(r.word)}`,
    language: 'eng', conceptId: sanitiseId(r.word), word: r.word,
    participant: r.rater, dims: r.dims, source: 'llm-validation', ts: now,
  })),
  responses: [],
};

writeFileSync(resolve(here, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(resolve(here, 'senselex-llm-validation-dataset.json'), `${JSON.stringify(dataset, null, 2)}\n`);
writeFileSync(resolve(here, 'llm-norms-eng.csv'), toSensorimotorCsv(norms, ALL_DIMENSIONS));

console.log(JSON.stringify(results, null, 2));
