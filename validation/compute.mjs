// Run the simulated-rater panel through the production code path: every record
// through the suite's validator, every norm through its norm functions, and the
// output in the formats the server and the browser edition use. Also computes the
// panel's internal reliability on every word it rated twelve times, with the same
// function human_benchmark.mjs applies to the Lancaster raters. That all-words
// value is descriptive: the preregistered H2 is computed by criterion.mjs on the
// confirmatory words.
//
// Inputs:  validation/raters.json        (panel output: 12 raters x 300 words)
//          validation/words-sample.json  (the sample)
// Run:     node validation/compute.mjs   (from the repository root)
// Writes:  validation/results.json
//          validation/llm-norms-eng.csv                     (server export format)
//          validation/senselex-llm-validation-dataset.json  (imports into the app)

import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRating } from '../src/domain/validation.js';
import {
  averageRatings,
  ratedCounts,
  dominantModality,
  maximumPerceptualStrength,
  modalityExclusivity,
  ratedChannelCount,
} from '../src/domain/norms.js';
import { ALL_DIMENSIONS, PERCEPTUAL_DIMENSIONS } from '../src/domain/dimensions.js';
import { toSensorimotorCsv } from '../src/server/export.js';
import { singleRaterReliability, mean, sd } from './stats.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(resolve(here, name), 'utf8'));

const panel = read('raters.json');
const sample = read('words-sample.json');
const itemOf = new Map(sample.items.map((w) => [w.word, w]));

const sanitiseId = (w) => w.toUpperCase().normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'ITEM';

// The panel must be complete and free of duplicates before anything is averaged:
// a repeated record would silently double a rater's weight, and a missing one
// would silently shrink a word's panel. Concept identifiers must also stay unique
// after sanitising, since the exported dataset merges records by identifier.
const sampleWords = sample.items.map((w) => w.word);
for (const rater of panel.raters) {
  const seen = rater.ratings.map((r) => r.word);
  const extra = seen.filter((w) => !itemOf.has(w));
  const repeated = seen.filter((w, i) => seen.indexOf(w) !== i);
  const absent = sampleWords.filter((w) => !seen.includes(w));
  if (extra.length || repeated.length || absent.length) {
    throw new Error(`Rater ${rater.rater}: ${extra.length} words outside the sample, ${repeated.length} repeated, ${absent.length} missing`);
  }
}
if (new Set(sampleWords.map(sanitiseId)).size !== sampleWords.length) {
  throw new Error('Two sample words sanitise to the same concept identifier');
}
if (!panel.provenance?.runDate) throw new Error('raters.json lacks provenance.runDate, which dates the exported records');

// ---- 1. Validate every record through the production validator --------------
//
// A word the rater marked as unknown produces no rating, as in the Lancaster
// procedure, and is counted separately. Every other record must pass the same
// validator the server applies; a failure stops the script, since it would mean
// the instrument had produced data its own server rejects.

const records = [];
let unknown = 0;
let blankChannels = 0;
for (const rater of panel.raters) {
  for (const r of rater.ratings) {
    if (r.dont_know) { unknown += 1; continue; }
    const dims = {};
    for (const d of ALL_DIMENSIONS) {
      if (typeof r[d] === 'number') dims[d] = r[d];
      else blankChannels += 1;
    }
    const value = validateRating({
      clientId: `panel-${rater.rater}-${sanitiseId(r.word)}`,
      languageCode: 'eng',
      conceptId: sanitiseId(r.word),
      word: r.word,
      participantRef: rater.rater,
      ratings: dims,
    });
    records.push({ rater: rater.rater, word: r.word, dims: value.ratings });
  }
}

// ---- 2. Norms per word ------------------------------------------------------

const byWord = new Map();
for (const rec of records) {
  if (!byWord.has(rec.word)) byWord.set(rec.word, []);
  byWord.get(rec.word).push(rec.dims);
}
const norms = [...byWord.keys()].sort().map((word) => {
  const vectors = byWord.get(word);
  const avg = averageRatings(vectors, ALL_DIMENSIONS);
  const item = itemOf.get(word);
  return {
    word,
    conceptId: sanitiseId(word),
    set: item.set,
    concreteness: item.concreteness,
    zipf: item.zipf,
    nRecords: vectors.length,
    n: ratedCounts(vectors, ALL_DIMENSIONS),
    mean: avg,
    dominantModality: dominantModality(avg, PERCEPTUAL_DIMENSIONS).modality,
    maximumPerceptualStrength: maximumPerceptualStrength(avg, PERCEPTUAL_DIMENSIONS),
    modalityExclusivity: modalityExclusivity(avg, PERCEPTUAL_DIMENSIONS),
    perceptualChannels: ratedChannelCount(avg, PERCEPTUAL_DIMENSIONS),
  };
});

// ---- 3. Internal reliability, computed as for the human raters --------------

const reliability = {};
for (const d of ALL_DIMENSIONS) {
  const ratingsByWord = [...byWord.values()].map((vs) => vs.map((v) => v[d]).filter((x) => typeof x === 'number'));
  reliability[d] = singleRaterReliability(ratingsByWord);
}

// ---- 4. Descriptives --------------------------------------------------------

const domCounts = {};
for (const n of norms) domCounts[n.dominantModality ?? 'none'] = (domCounts[n.dominantModality ?? 'none'] || 0) + 1;
const excl = norms.map((n) => n.modalityExclusivity).filter((v) => v !== null);
const maxs = norms.map((n) => n.maximumPerceptualStrength).filter((v) => v !== null);

const results = {
  design: {
    raters: panel.raters.length,
    words: norms.length,
    recordsValidated: records.length,
    wordsMarkedUnknown: unknown,
    blankChannels,
    provenance: panel.provenance,
  },
  reliability,
  structure: {
    dominantModalityCounts: domCounts,
    visionDominantShare: (domCounts.vision || 0) / norms.length,
    modalityExclusivity: { mean: mean(excl), sd: sd(excl), min: Math.min(...excl), max: Math.max(...excl) },
    maximumPerceptualStrength: { mean: mean(maxs), sd: sd(maxs) },
  },
};

// ---- 5. Artefacts -----------------------------------------------------------
//
// A fixed stamp instead of the wall clock, so rerunning the script reproduces the
// artefacts byte for byte. It is the date the panel was collected.
const stamp = Date.parse(`${panel.provenance.runDate}T00:00:00Z`);
const dataset = {
  version: 5,
  languages: [{ code: 'eng', name: 'English', script: 'Latin', direction: 'ltr', family: 'Indo-European' }],
  items: sample.items.map((w) => ({
    language: 'eng', conceptId: sanitiseId(w.word), gloss: w.word, word: w.word,
    concreteness: w.concreteness >= 3.5 ? 'high' : w.concreteness <= 2.5 ? 'low' : 'medium',
    concretenessValue: w.concreteness, frequency: w.zipf,
  })),
  ratings: records.map((r) => ({
    id: `panel-${r.rater}-${sanitiseId(r.word)}`,
    language: 'eng', conceptId: sanitiseId(r.word), word: r.word,
    participant: r.rater, dims: r.dims, source: 'llm-validation', ts: stamp,
  })),
  responses: [],
};

writeFileSync(resolve(here, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(resolve(here, 'senselex-llm-validation-dataset.json'), `${JSON.stringify(dataset, null, 2)}\n`);
writeFileSync(resolve(here, 'llm-norms-eng.csv'), toSensorimotorCsv(norms, ALL_DIMENSIONS));

process.stdout.write(`${records.length} records validated; ${unknown} marked unknown; ${blankChannels} blank channels\n`);
for (const d of ALL_DIMENSIONS) process.stdout.write(`  ${d.padEnd(14)} machine single-rater reliability ${reliability[d].r1.toFixed(3)}\n`);
