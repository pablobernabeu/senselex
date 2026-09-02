// Criterion validation against the published Lancaster Sensorimotor Norms.
//
// The computational validation in compute.mjs establishes that the pipeline runs
// and that its output has the structure sensorimotor norms have. It cannot fail
// in an interesting way: a panel that agrees with itself will always look
// reliable, and a comparison against concreteness only asks whether two related
// constructs are related. This script adds the two checks that can fail.
//
// 1. REPRODUCTION. The Lancaster release publishes both the per-dimension means
//    and the quantities derived from them (maximum perceptual strength, modality
//    exclusivity, dominant perceptual modality) for 39,707 words. Pushing the
//    published means through this suite's own norm functions and comparing the
//    result with the published derived columns is a direct test of the software
//    against an external ground truth, over the whole lexicon rather than a
//    sample. If the mathematics is wrong anywhere, this finds it.
//
// 2. CRITERION VALIDITY. For the sixty words the simulated panel rated, the
//    Lancaster norms give the human values on the same eleven channels. The
//    correlation between the machine norms and the human norms, per channel, is
//    the question the validation section should be answering, and it supplies
//    the human benchmark the paper otherwise has to assert.
//
// Neither check needs participants or ethical approval: both reuse an openly
// published, aggregated dataset.
//
// Source: Lynott, D., Connell, L., Brysbaert, M., Brand, J., & Carney, J. (2020).
// The Lancaster Sensorimotor Norms: Multidimensional measures of perceptual and
// action strength for 40,000 English words. Behavior Research Methods, 52,
// 1271-1291. https://doi.org/10.3758/s13428-019-01316-z
// Data: https://osf.io/7emr6/ (file 48wsc), expected at
// validation/lancaster-sensorimotor-norms.csv.

import process from 'node:process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  dominantModality,
  maximumPerceptualStrength,
  modalityExclusivity,
} from '../src/domain/norms.js';
import { PERCEPTUAL_DIMENSIONS, ALL_DIMENSIONS } from '../src/domain/dimensions.js';

const here = dirname(fileURLToPath(import.meta.url));
const LANCASTER = resolve(here, 'lancaster-sensorimotor-norms.csv');

if (!existsSync(LANCASTER)) {
  process.stderr.write(
    `Lancaster norms not found at ${LANCASTER}.\n` +
    'Fetch them with:\n' +
    '  curl -sS -L -o validation/lancaster-sensorimotor-norms.csv "https://osf.io/download/48wsc/"\n',
  );
  process.exit(1);
}

// The Lancaster column names differ from this suite's dimension names. The
// mapping is one to one: the two sets describe the same eleven channels, which
// is what makes the comparison meaningful rather than approximate.
const COLUMN_OF = {
  touch: 'Haptic',
  hearing: 'Auditory',
  smell: 'Olfactory',
  taste: 'Gustatory',
  vision: 'Visual',
  interoception: 'Interoceptive',
  mouth_throat: 'Mouth',
  hand_arm: 'Hand_arm',
  foot_leg: 'Foot_leg',
  head: 'Head',
  torso: 'Torso',
};

// Lancaster names its dominant perceptual modality with its own labels.
const DOMINANT_OF = {
  Haptic: 'touch',
  Auditory: 'hearing',
  Olfactory: 'smell',
  Gustatory: 'taste',
  Visual: 'vision',
  Interoceptive: 'interoception',
};

// ---- Statistics -------------------------------------------------------------

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

// Fisher z interval. Reported because n = 60 leaves these correlations much less
// precise than three decimal places would suggest.
function ciFor(r, n) {
  if (r === null || n < 4) return null;
  const z = 0.5 * Math.log((1 + r) / (1 - r));
  const se = 1 / Math.sqrt(n - 3);
  const lo = z - 1.96 * se;
  const hi = z + 1.96 * se;
  const back = (v) => (Math.exp(2 * v) - 1) / (Math.exp(2 * v) + 1);
  return [back(lo), back(hi)];
}

// ---- Read the Lancaster release --------------------------------------------

// The file is a plain comma-separated export with quoted fields, so a small
// reader is enough and keeps the zero-dependency rule.
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { quoted = false; }
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

process.stdout.write('Reading the Lancaster norms...\n');
const raw = readFileSync(LANCASTER, 'utf8').split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(raw[0]);
const index = Object.fromEntries(header.map((h, i) => [h, i]));

const lancaster = new Map();
for (let i = 1; i < raw.length; i += 1) {
  const cells = parseCsvLine(raw[i]);
  const word = cells[index.Word];
  if (!word) continue;
  const means = {};
  let usable = true;
  for (const [dimension, column] of Object.entries(COLUMN_OF)) {
    const value = Number(cells[index[`${column}.mean`]]);
    if (!Number.isFinite(value)) { usable = false; break; }
    means[dimension] = value;
  }
  if (!usable) continue;
  lancaster.set(word.toLowerCase(), {
    means,
    publishedMaxStrength: Number(cells[index['Max_strength.perceptual']]),
    publishedExclusivity: Number(cells[index['Exclusivity.perceptual']]),
    publishedDominant: cells[index['Dominant.perceptual']],
  });
}
process.stdout.write(`  ${lancaster.size} words with complete perceptual and action means\n`);

// ---- 1. Reproduction: our functions against their published derived columns --

process.stdout.write('\nReproducing the published derived columns...\n');

const TOLERANCE = 5e-4; // the release rounds its derived columns
const reproduction = {
  words: 0,
  maxStrengthAgree: 0,
  exclusivityAgree: 0,
  dominantAgree: 0,
  dominantTied: 0,
  dominantGenuine: 0,
  maxStrengthWorst: 0,
  exclusivityWorst: 0,
  dominantMismatches: [],
};

for (const [word, entry] of lancaster) {
  reproduction.words += 1;

  const ourMax = maximumPerceptualStrength(entry.means, PERCEPTUAL_DIMENSIONS);
  const ourExclusivity = modalityExclusivity(entry.means, PERCEPTUAL_DIMENSIONS);
  const ourDominant = dominantModality(entry.means, PERCEPTUAL_DIMENSIONS).modality;

  if (Number.isFinite(entry.publishedMaxStrength)) {
    const delta = Math.abs(ourMax - entry.publishedMaxStrength);
    if (delta <= TOLERANCE) reproduction.maxStrengthAgree += 1;
    if (delta > reproduction.maxStrengthWorst) reproduction.maxStrengthWorst = delta;
  }
  if (Number.isFinite(entry.publishedExclusivity) && ourExclusivity !== null) {
    const delta = Math.abs(ourExclusivity - entry.publishedExclusivity);
    if (delta <= TOLERANCE) reproduction.exclusivityAgree += 1;
    if (delta > reproduction.exclusivityWorst) reproduction.exclusivityWorst = delta;
  }
  const theirDominant = DOMINANT_OF[entry.publishedDominant];
  if (theirDominant) {
    if (theirDominant === ourDominant) reproduction.dominantAgree += 1;
    else {
      // Where two channels share the maximum, the choice between them is a
      // convention rather than a computation, and the two implementations
      // resolve it differently. Counting how many mismatches are ties separates
      // a disagreement about the mathematics from a disagreement about
      // tie-breaking, which is the difference between a defect and a footnote.
      const values = PERCEPTUAL_DIMENSIONS.map((d) => entry.means[d]);
      const top = Math.max(...values);
      const tied = values.filter((v) => v === top).length > 1;
      if (tied) reproduction.dominantTied += 1;
      else reproduction.dominantGenuine += 1;
      if (reproduction.dominantMismatches.length < 20) {
        reproduction.dominantMismatches.push({ word, ours: ourDominant, theirs: theirDominant, tied });
      }
    }
  }
}

process.stdout.write(`  maximum perceptual strength: ${reproduction.maxStrengthAgree}/${reproduction.words} exact (worst delta ${reproduction.maxStrengthWorst.toExponential(2)})\n`);
process.stdout.write(`  modality exclusivity:        ${reproduction.exclusivityAgree}/${reproduction.words} exact (worst delta ${reproduction.exclusivityWorst.toExponential(2)})\n`);
process.stdout.write(`  dominant perceptual modality: ${reproduction.dominantAgree}/${reproduction.words} exact\n`);
process.stdout.write(`    ${reproduction.dominantTied} differ only where two channels tie in the published means\n`);
process.stdout.write(`    ${reproduction.dominantGenuine} differ on which channel is strongest\n`);

// ---- 2. Criterion validity for the sixty rated words ------------------------

process.stdout.write('\nComparing the machine panel against the human norms...\n');

const machine = JSON.parse(readFileSync(resolve(here, 'results.json'), 'utf8'));
const machineNorms = JSON.parse(readFileSync(resolve(here, 'senselex-llm-validation-dataset.json'), 'utf8'));

// Rebuild the machine per-word means from the dataset the study produced, so this
// script reads the same artefact a user would import into the application.
const byWord = new Map();
for (const rating of machineNorms.ratings) {
  const word = rating.word.toLowerCase();
  if (!byWord.has(word)) byWord.set(word, []);
  byWord.get(word).push(rating.dims);
}

const perDimension = {};
const matched = [];
for (const [word, vectors] of byWord) {
  const human = lancaster.get(word);
  if (!human) continue;
  const ours = {};
  for (const dimension of ALL_DIMENSIONS) {
    const column = vectors.map((v) => v[dimension]).filter((v) => typeof v === 'number' && Number.isFinite(v));
    ours[dimension] = column.length ? mean(column) : null;
  }
  matched.push({ word, ours, human: human.means });
}

process.stdout.write(`  ${matched.length} of ${byWord.size} rated words found in the Lancaster release\n`);

for (const dimension of ALL_DIMENSIONS) {
  const xs = [];
  const ys = [];
  for (const row of matched) {
    if (row.ours[dimension] === null) continue;
    xs.push(row.ours[dimension]);
    ys.push(row.human[dimension]);
  }
  const r = pearson(xs, ys);
  perDimension[dimension] = { n: xs.length, r, ci: ciFor(r, xs.length) };
}

// Derived measures, computed the same way on both sides.
function derived(rows, side) {
  const maxStrength = [];
  const exclusivity = [];
  let dominantAgree = 0;
  for (const row of rows) {
    const vector = side === 'ours' ? row.ours : row.human;
    maxStrength.push(maximumPerceptualStrength(vector, PERCEPTUAL_DIMENSIONS));
    const e = modalityExclusivity(vector, PERCEPTUAL_DIMENSIONS);
    exclusivity.push(e);
    if (side === 'ours') {
      const a = dominantModality(row.ours, PERCEPTUAL_DIMENSIONS).modality;
      const b = dominantModality(row.human, PERCEPTUAL_DIMENSIONS).modality;
      if (a === b) dominantAgree += 1;
    }
  }
  return { maxStrength, exclusivity, dominantAgree };
}

const oursDerived = derived(matched, 'ours');
const humanDerived = derived(matched, 'human');

const maxStrengthR = pearson(oursDerived.maxStrength, humanDerived.maxStrength);
const exclusivityR = pearson(oursDerived.exclusivity, humanDerived.exclusivity);

const summary = {
  source: {
    dataset: 'Lancaster Sensorimotor Norms (Lynott et al., 2020)',
    doi: '10.3758/s13428-019-01316-z',
    osf: 'https://osf.io/7emr6/',
    wordsRead: lancaster.size,
  },
  reproduction: {
    words: reproduction.words,
    maximumPerceptualStrength: { exact: reproduction.maxStrengthAgree, worstAbsoluteDelta: reproduction.maxStrengthWorst },
    modalityExclusivity: { exact: reproduction.exclusivityAgree, worstAbsoluteDelta: reproduction.exclusivityWorst },
    dominantPerceptualModality: {
      exact: reproduction.dominantAgree,
      differingByTieBreak: reproduction.dominantTied,
      differingGenuinely: reproduction.dominantGenuine,
      mismatchExamples: reproduction.dominantMismatches,
    },
    tolerance: TOLERANCE,
  },
  criterion: {
    matchedWords: matched.length,
    perDimension,
    maximumPerceptualStrength: { r: maxStrengthR, ci: ciFor(maxStrengthR, matched.length) },
    modalityExclusivity: { r: exclusivityR, ci: ciFor(exclusivityR, matched.length) },
    dominantModalityAgreement: {
      matches: oursDerived.dominantAgree,
      of: matched.length,
      proportion: oursDerived.dominantAgree / matched.length,
    },
    means: {
      machineExclusivity: mean(oursDerived.exclusivity.filter((v) => v !== null)),
      humanExclusivity: mean(humanDerived.exclusivity.filter((v) => v !== null)),
      machineMaxStrength: mean(oursDerived.maxStrength),
      humanMaxStrength: mean(humanDerived.maxStrength),
    },
  },
  machinePanel: {
    interRaterMeanPairwise: machine.interRater?.meanPairwisePearson ?? null,
  },
};

writeFileSync(resolve(here, 'criterion-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

process.stdout.write('\nPer-channel agreement with the human norms:\n');
for (const dimension of ALL_DIMENSIONS) {
  const d = perDimension[dimension];
  const ci = d.ci ? ` [${d.ci[0].toFixed(2)}, ${d.ci[1].toFixed(2)}]` : '';
  process.stdout.write(`  ${dimension.padEnd(14)} r = ${d.r === null ? 'n/a' : d.r.toFixed(3)}${ci}  (n = ${d.n})\n`);
}
process.stdout.write(`\n  maximum perceptual strength r = ${maxStrengthR.toFixed(3)}\n`);
process.stdout.write(`  modality exclusivity        r = ${exclusivityR.toFixed(3)}\n`);
process.stdout.write(`  dominant modality agreement  ${oursDerived.dominantAgree}/${matched.length}\n`);
process.stdout.write('\nWrote criterion-results.json\n');
