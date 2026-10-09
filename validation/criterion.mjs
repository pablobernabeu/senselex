// Comparisons with the published Lancaster Sensorimotor Norms.
//
// 1. REPRODUCTION. The Lancaster release publishes both the per-dimension means
//    and the quantities derived from them (maximum perceptual strength, modality
//    exclusivity, dominant perceptual modality) for 39,707 words. Passing the
//    published means through this suite's own norm functions and comparing the
//    output with the published derived columns tests the software against an
//    external standard across the whole lexicon. human_benchmark.mjs goes one step
//    further back, from individual ratings to the means.
//
// 2. THE PREREGISTERED HYPOTHESES (PREDICTIONS.md), on the simulated panel:
//    H1, that machine-human agreement is lower on the action channels than on the
//    perceptual channels (Xu et al., 2025); H1b (Amendment 1), whether that gap
//    survives correction for the reliability of both sets of means; H2, that the
//    machine panel is more internally consistent than human raters, measured
//    identically on the same words; H3, that the machine panel rates more
//    strongly and less exclusively than people. All are tested on the 246
//    confirmatory words no simulated rater had seen before.
//
// 3. EXPLORATORY, reported as such: per-channel agreement on all 300 words, the
//    head channel under the corrected wording, stability across model versions on
//    the 54 overlap words, the zero pile-up, and H2 and H1b as the analysis script
//    made public with the preregistration amendment computed them, on all 300
//    words.
//
// No participants and no ethical review: every human value is published data.
//
// Source: Lynott, D., Connell, L., Brysbaert, M., Brand, J., & Carney, J. (2020).
// The Lancaster Sensorimotor Norms: Multidimensional measures of perceptual and
// action strength for 40,000 English words. Behavior Research Methods, 52,
// 1271-1291. https://doi.org/10.3758/s13428-019-01316-z. Data: https://osf.io/7emr6/
//
// Run from the repository root, after compute.mjs and human_benchmark.mjs:
//   node validation/criterion.mjs
// Reads lancaster-sensorimotor-norms.csv from SENSELEX_DATA_DIR (default:
// validation/), checked against its published checksum (lancaster.mjs).
// Writes validation/criterion-results.json and validation/panel-vs-human.json.

import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  averageRatings,
  dominantModality,
  maximumPerceptualStrength,
  modalityExclusivity,
} from '../src/domain/norms.js';
import { PERCEPTUAL_DIMENSIONS, ACTION_DIMENSIONS, ALL_DIMENSIONS } from '../src/domain/dimensions.js';
import { pearson, spearman, fisherCi, bootstrap, mean, reliabilityOfMeans, disattenuate, singleRaterReliability } from './stats.mjs';
import { verifiedLancasterPath, readNormsCsv, columnIndex } from './lancaster.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LANCASTER = await verifiedLancasterPath('norms');

const COLUMN_OF = {
  touch: 'Haptic', hearing: 'Auditory', smell: 'Olfactory', taste: 'Gustatory',
  vision: 'Visual', interoception: 'Interoceptive', mouth_throat: 'Mouth',
  hand_arm: 'Hand_arm', foot_leg: 'Foot_leg', head: 'Head', torso: 'Torso',
};
const DOMINANT_OF = {
  Haptic: 'touch', Auditory: 'hearing', Olfactory: 'smell',
  Gustatory: 'taste', Visual: 'vision', Interoceptive: 'interoception',
};

// ---- Read the Lancaster release --------------------------------------------

// Every published row must parse, and no two words may collide once trimmed and
// lower-cased: either failure would otherwise drop or overwrite a word silently
// and change the reproduction counts without any sign of it.
const { header, rows: normRows } = readNormsCsv(LANCASTER);
const index = columnIndex(header, [
  'Word', 'Max_strength.perceptual', 'Exclusivity.perceptual', 'Dominant.perceptual',
  ...Object.values(COLUMN_OF).map((col) => `${col}.mean`),
]);
const lancaster = new Map();
for (const cells of normRows) {
  const word = cells[index.Word].trim().toLowerCase();
  const means = {};
  for (const [d, col] of Object.entries(COLUMN_OF)) {
    const v = Number(cells[index[`${col}.mean`]]);
    if (cells[index[`${col}.mean`]] === '' || !Number.isFinite(v)) throw new Error(`Non-numeric ${col}.mean for ${word}`);
    means[d] = v;
  }
  if (lancaster.has(word)) throw new Error(`Two published rows share the word ${word}`);
  lancaster.set(word, {
    means,
    publishedMaxStrength: Number(cells[index['Max_strength.perceptual']]),
    publishedExclusivity: Number(cells[index['Exclusivity.perceptual']]),
    publishedDominant: cells[index['Dominant.perceptual']],
  });
}

// ---- 1. Reproduction of the published derived columns ------------------------

const TOLERANCE = 5e-4; // the release rounds its derived columns
const rep = { words: 0, maxExact: 0, exclExact: 0, domExact: 0, domTied: 0, domGenuine: 0, maxWorst: 0, exclWorst: 0 };
for (const entry of lancaster.values()) {
  rep.words += 1;
  const m = maximumPerceptualStrength(entry.means, PERCEPTUAL_DIMENSIONS);
  const e = modalityExclusivity(entry.means, PERCEPTUAL_DIMENSIONS);
  const d = dominantModality(entry.means, PERCEPTUAL_DIMENSIONS).modality;
  const dm = Math.abs(m - entry.publishedMaxStrength);
  const de = Math.abs(e - entry.publishedExclusivity);
  if (dm <= TOLERANCE) rep.maxExact += 1;
  if (de <= TOLERANCE) rep.exclExact += 1;
  rep.maxWorst = Math.max(rep.maxWorst, dm);
  rep.exclWorst = Math.max(rep.exclWorst, de);
  const theirs = DOMINANT_OF[entry.publishedDominant];
  if (theirs === d) rep.domExact += 1;
  else {
    // Where two channels share the maximum, naming one is a convention and not a
    // computation, so ties are counted apart from genuine disagreements.
    const values = PERCEPTUAL_DIMENSIONS.map((x) => entry.means[x]);
    const top = Math.max(...values);
    if (values.filter((v) => v === top).length > 1) rep.domTied += 1;
    else rep.domGenuine += 1;
  }
}
process.stdout.write(`Reproduction over ${rep.words} words: max strength ${rep.maxExact} exact, exclusivity ${rep.exclExact} exact (worst ${rep.exclWorst.toExponential(2)}), dominant ${rep.domExact} exact, ${rep.domTied} ties, ${rep.domGenuine} genuine differences\n`);

// ---- 2. The panel against the human norms ----------------------------------

const panel = JSON.parse(readFileSync(resolve(here, 'raters.json'), 'utf8'));
const sample = JSON.parse(readFileSync(resolve(here, 'words-sample.json'), 'utf8')).items;
const setOf = new Map(sample.map((i) => [i.word, i.set]));
// sample_words.mjs drew only words present in the Lancaster release, so every
// sample word must find its human norms; a miss would silently shrink the
// confirmatory set.
const unmatched = sample.filter((i) => !lancaster.has(i.word));
if (unmatched.length) throw new Error(`${unmatched.length} sample words are absent from the Lancaster norms, e.g. ${unmatched[0].word}`);
const machineResults = JSON.parse(readFileSync(resolve(here, 'results.json'), 'utf8'));
const humanBenchmark = JSON.parse(readFileSync(resolve(here, 'human-benchmark-results.json'), 'utf8'));

// Per-word machine means. `blankAs` decides what a blank channel means: null
// follows SenseLex's semantics (not judged), 0 follows Lancaster's (every channel
// rated, not experienced is 0). The confirmatory analysis uses null; the other is
// the preregistered sensitivity check.
function machineMeans(blankAs) {
  const byWord = new Map();
  for (const rater of panel.raters) {
    for (const r of rater.ratings) {
      if (r.dont_know) continue;
      const v = {};
      for (const d of ALL_DIMENSIONS) {
        if (typeof r[d] === 'number') v[d] = r[d];
        else if (blankAs !== null) v[d] = blankAs;
      }
      if (!byWord.has(r.word)) byWord.set(r.word, []);
      byWord.get(r.word).push(v);
    }
  }
  const out = new Map();
  for (const [w, vs] of byWord) out.set(w, averageRatings(vs, ALL_DIMENSIONS));
  return out;
}

function rowsFor(means, set) {
  const rows = [];
  for (const [word, m] of means) {
    if (set && setOf.get(word) !== set) continue;
    const h = lancaster.get(word);
    if (h) rows.push({ word, m, h: h.means });
  }
  return rows;
}

function agreement(rows, d, coef) {
  const pairs = rows.filter((r) => typeof r.m[d] === 'number');
  return coef(pairs.map((r) => r.m[d]), pairs.map((r) => r.h[d]));
}

function perChannel(rows) {
  const out = {};
  for (const d of ALL_DIMENSIONS) {
    const n = rows.filter((r) => typeof r.m[d] === 'number').length;
    const rho = agreement(rows, d, spearman);
    const r = agreement(rows, d, pearson);
    out[d] = { n, spearman: rho, pearson: r, pearsonCi: fisherCi(r, n) };
  }
  return out;
}

// H1's statistic: mean agreement over the perceptual channels minus mean over the
// action channels, in Spearman's rho as Xu et al. (2025) reported it.
const domainGap = (rows) =>
  mean(PERCEPTUAL_DIMENSIONS.map((d) => agreement(rows, d, spearman)))
  - mean(ACTION_DIMENSIONS.map((d) => agreement(rows, d, spearman)));

// H1b (Amendment 1): the same gap on Pearson correlations corrected for the
// reliability of both sets of means, so that a channel whose human norm is noisy
// is not read as one the model fails to recover. Reliabilities are held at their
// full-sample values inside the bootstrap.
const pearsonGap = (rows) =>
  mean(PERCEPTUAL_DIMENSIONS.map((d) => agreement(rows, d, pearson)))
  - mean(ACTION_DIMENSIONS.map((d) => agreement(rows, d, pearson)));

function correctedGap(reliability) {
  const corrected = (rows, d) => disattenuate(agreement(rows, d, pearson), reliability[d].machine, reliability[d].human);
  return (rows) => mean(PERCEPTUAL_DIMENSIONS.map((d) => corrected(rows, d))) - mean(ACTION_DIMENSIONS.map((d) => corrected(rows, d)));
}

// Single-rater reliability of the machine panel on the preregistered word set:
// for each channel, the confirmatory words that both panels rated at least twelve
// times, as listed by human_benchmark.mjs, so that the two panels' values come
// from the same function on the same words (H2).
const machineRatings = new Map(); // word -> { channel: [ratings] }
for (const rater of panel.raters) {
  for (const r of rater.ratings) {
    if (r.dont_know) continue;
    const byChannel = machineRatings.get(r.word) ?? {};
    for (const d of ALL_DIMENSIONS) if (typeof r[d] === 'number') (byChannel[d] ??= []).push(r[d]);
    machineRatings.set(r.word, byChannel);
  }
}
const humanConfirmatory = humanBenchmark.humanReliabilityOnConfirmatoryWords;
const machineConfirmatory = {};
for (const d of ALL_DIMENSIONS) {
  const { wordSet } = humanConfirmatory[d];
  const rel = singleRaterReliability(wordSet.map((w) => machineRatings.get(w)[d]), { halfSize: 6 });
  if (rel.words !== wordSet.length) throw new Error(`${d}: the machine panel rated only ${rel.words} of the ${wordSet.length} listed words twelve times`);
  machineConfirmatory[d] = rel;
}

// Reliability of each set of means, per channel, for H1b: each panel's
// single-rater reliability on the preregistered word set, stepped up to the
// harmonic mean of the per-word rater counts over the 246 confirmatory words
// whose means the correlations use. The machine counts fall below twelve only
// where a rater marked a word unknown.
const confirmatoryWords = sample.filter((i) => i.set === 'confirmatory').map((i) => i.word);
function meanReliabilities() {
  const out = {};
  for (const d of ALL_DIMENSIONS) {
    const counts = confirmatoryWords.map((w) => machineRatings.get(w)?.[d]?.length ?? 0);
    out[d] = {
      machine: reliabilityOfMeans(machineConfirmatory[d].r1, counts).reliability,
      human: humanConfirmatory[d].reliabilityOfPublishedMeans,
    };
  }
  return out;
}
const reliabilities = meanReliabilities();

const derived = (v) => ({
  max: maximumPerceptualStrength(v, PERCEPTUAL_DIMENSIONS),
  excl: modalityExclusivity(v, PERCEPTUAL_DIMENSIONS),
  dom: dominantModality(v, PERCEPTUAL_DIMENSIONS).modality,
});

function hypotheses(means, label) {
  const conf = rowsFor(means, 'confirmatory');
  const h1 = bootstrap(conf, domainGap);
  const verdict1 = h1.ci[0] > 0 ? 'supported' : h1.ci[1] < 0 ? 'contradicted' : 'unresolved';
  const uncorrected = bootstrap(conf, pearsonGap);
  const h1b = bootstrap(conf, correctedGap(reliabilities));
  const verdict1b = h1b.ci[0] > 0 ? 'gradient survives correction'
    : (h1b.estimate < uncorrected.estimate && h1b.ci[0] <= 0 && h1b.ci[1] >= 0) ? 'consistent with a reliability artefact'
      : 'unresolved';

  const maxGap = bootstrap(conf, (rows) => mean(rows.map((r) => derived(r.m).max)) - mean(rows.map((r) => derived(r.h).max)));
  const exclRows = conf.filter((r) => derived(r.m).excl !== null && derived(r.h).excl !== null);
  const exclGap = bootstrap(exclRows, (rows) => mean(rows.map((r) => derived(r.m).excl)) - mean(rows.map((r) => derived(r.h).excl)));
  const verdict3 = maxGap.ci[0] > 0 && exclGap.ci[1] < 0 ? 'supported'
    : (maxGap.ci[1] < 0 || exclGap.ci[0] > 0) ? 'contradicted' : 'partly supported or unresolved';

  process.stdout.write(`\n${label}\n`);
  process.stdout.write(`  H1 domain gap (rho, perceptual minus action) = ${h1.estimate.toFixed(3)} [${h1.ci[0].toFixed(3)}, ${h1.ci[1].toFixed(3)}] -> ${verdict1}\n`);
  process.stdout.write(`  H1b Pearson gap uncorrected = ${uncorrected.estimate.toFixed(3)} [${uncorrected.ci[0].toFixed(3)}, ${uncorrected.ci[1].toFixed(3)}]; corrected for attenuation = ${h1b.estimate.toFixed(3)} [${h1b.ci[0].toFixed(3)}, ${h1b.ci[1].toFixed(3)}] -> ${verdict1b}
`);
  process.stdout.write(`  H3 max strength, machine minus human = ${maxGap.estimate.toFixed(3)} [${maxGap.ci[0].toFixed(3)}, ${maxGap.ci[1].toFixed(3)}]\n`);
  process.stdout.write(`  H3 exclusivity, machine minus human = ${exclGap.estimate.toFixed(3)} [${exclGap.ci[0].toFixed(3)}, ${exclGap.ci[1].toFixed(3)}] -> ${verdict3}\n`);
  return {
    confirmatoryWords: conf.length,
    perChannel: perChannel(conf),
    H1: { statistic: 'mean rho(perceptual) - mean rho(action)', ...h1, verdict: verdict1 },
    H1b: {
      statistic: 'mean disattenuated r(perceptual) - mean disattenuated r(action)',
      uncorrectedPearsonGap: uncorrected,
      corrected: h1b,
      verdict: verdict1b,
      note: 'Reliabilities held fixed inside the bootstrap, so the interval is somewhat too narrow.',
      correctedByChannel: Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, disattenuate(agreement(conf, d, pearson), reliabilities[d].machine, reliabilities[d].human)])),
    },
    H3: { maxStrengthGap: maxGap, exclusivityGap: exclGap, verdict: verdict3 },
  };
}

const primary = hypotheses(machineMeans(null), 'CONFIRMATORY (blank = not judged)');
const sensitivity = hypotheses(machineMeans(0), 'SENSITIVITY (blank = 0)');

// H2: single-rater reliability, machine against human, same function, same words.
const h2 = {};
let machineHigherEverywhere = true;
for (const d of ALL_DIMENSIONS) {
  const machine = machineConfirmatory[d].r1;
  const human = humanConfirmatory[d].r1;
  h2[d] = { words: humanConfirmatory[d].wordSet.length, machine, human, difference: machine - human };
  if (!(machine > human)) machineHigherEverywhere = false;
}

// The same comparison as the analysis script made public with the preregistration
// amendment made it, on all 300 words and with each panel's own eligible words.
// The preregistration's text puts every test on the confirmatory words, and that
// text is followed above, a choice made after the data were collected. This
// version is kept to show that the choice does not change the verdict.
// Exploratory.
const h2AllWords = Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, {
  machine: machineResults.reliability[d].r1,
  machineWords: machineResults.reliability[d].words,
  human: humanBenchmark.humanReliabilityOnPanelWords[d].r1,
  humanWords: humanBenchmark.humanReliabilityOnPanelWords[d].words,
}]));
const h2AllWordsHigherEverywhere = ALL_DIMENSIONS.every((d) => h2AllWords[d].machine > h2AllWords[d].human);

// H1b as that script computed it: the same confirmatory correlations,
// corrected with each panel's reliability estimated on all 300 words (the machine
// one stepped up over every word's record count). Exploratory, kept so that the
// statement that the script's computation reached the same verdict can be checked.
const recordCounts = new Map();
for (const rater of panel.raters) for (const r of rater.ratings) if (!r.dont_know) recordCounts.set(r.word, (recordCounts.get(r.word) || 0) + 1);
const reliabilitiesAllWords = Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, {
  machine: reliabilityOfMeans(machineResults.reliability[d].r1, [...recordCounts.values()]).reliability,
  human: humanBenchmark.humanReliabilityOnPanelWords[d].reliabilityOfPublishedMeans,
}]));
const h1bAllWords = bootstrap(rowsFor(machineMeans(null), 'confirmatory'), correctedGap(reliabilitiesAllWords));
const h1bAllWordsVerdict = h1bAllWords.ci[0] > 0 ? 'gradient survives correction'
  : (h1bAllWords.estimate < primary.H1b.uncorrectedPearsonGap.estimate && h1bAllWords.ci[0] <= 0 && h1bAllWords.ci[1] >= 0) ? 'consistent with a reliability artefact'
    : 'unresolved';
process.stdout.write(`\nH2 machine single-rater reliability exceeds human on every channel: ${machineHigherEverywhere}\n`);
for (const d of ALL_DIMENSIONS) process.stdout.write(`  ${d.padEnd(14)} machine ${h2[d].machine.toFixed(3)}  human ${h2[d].human.toFixed(3)}\n`);

// ---- 3. Exploratory ---------------------------------------------------------

const allRows = rowsFor(machineMeans(null));
const allWords = {
  words: allRows.length,
  perChannel: perChannel(allRows),
  maximumPerceptualStrength: (() => {
    const r = pearson(allRows.map((x) => derived(x.m).max), allRows.map((x) => derived(x.h).max));
    return { pearson: r, ci: fisherCi(r, allRows.length) };
  })(),
  modalityExclusivity: (() => {
    const rows = allRows.filter((x) => derived(x.m).excl !== null && derived(x.h).excl !== null);
    const r = pearson(rows.map((x) => derived(x.m).excl), rows.map((x) => derived(x.h).excl));
    return { pearson: r, ci: fisherCi(r, rows.length) };
  })(),
  dominantAgreement: (() => {
    const agree = allRows.filter((x) => derived(x.m).dom === derived(x.h).dom).length;
    return { matches: agree, of: allRows.length, proportion: agree / allRows.length };
  })(),
  means: {
    machineMaxStrength: mean(allRows.map((x) => derived(x.m).max)),
    humanMaxStrength: mean(allRows.map((x) => derived(x.h).max)),
    machineExclusivity: mean(allRows.map((x) => derived(x.m).excl).filter((v) => v !== null)),
    humanExclusivity: mean(allRows.map((x) => derived(x.h).excl).filter((v) => v !== null)),
  },
};

// Stability across model versions: the pilot's means against this panel's, on the
// 54 overlap words. Model and wording both changed, so this bounds how far
// simulated norms move between versions; it cannot separate the two causes.
const pilot = JSON.parse(readFileSync(resolve(here, 'pilot/raters-pilot.json'), 'utf8'));
const pilotCriterion = JSON.parse(readFileSync(resolve(here, 'pilot/criterion-results-pilot.json'), 'utf8'));
const pilotByWord = new Map();
for (const rater of pilot.raters) {
  for (const r of rater.ratings) {
    if (!pilotByWord.has(r.word)) pilotByWord.set(r.word, []);
    pilotByWord.get(r.word).push(r);
  }
}
const current = machineMeans(null);
const overlap = sample.filter((i) => i.set === 'overlap').map((i) => i.word).filter((w) => pilotByWord.has(w) && current.has(w));
const stability = {};
for (const d of ALL_DIMENSIONS) {
  const pairs = overlap
    .map((w) => [averageRatings(pilotByWord.get(w), [d])[d], current.get(w)[d]])
    .filter(([a, b]) => typeof a === 'number' && typeof b === 'number');
  stability[d] = { n: pairs.length, pearson: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])) };
}

// How often a channel's mean is exactly zero, and the mean level per channel, on
// all 300 words. Exploratory: added after the scatterplots showed the panel's
// means piling up at zero. A machine mean of zero means all twelve raters said
// "not at all"; a human mean of zero means every one of about eighteen did, which
// is rarer simply because more people must agree. The comparison is therefore
// descriptive of how unanimous each panel is, not a test.
const zerosAndLevels = {};
let zeroMachine = 0;
let zeroHuman = 0;
let zeroCells = 0;
for (const d of ALL_DIMENSIONS) {
  const rows = allRows.filter((r) => typeof r.m[d] === 'number');
  const zm = rows.filter((r) => r.m[d] === 0).length;
  const zh = rows.filter((r) => r.h[d] === 0).length;
  zeroMachine += zm;
  zeroHuman += zh;
  zeroCells += rows.length;
  zerosAndLevels[d] = {
    words: rows.length,
    machineMeanZero: zm,
    humanMeanZero: zh,
    machineLevel: mean(rows.map((r) => r.m[d])),
    humanLevel: mean(rows.map((r) => r.h[d])),
  };
}

const summary = {
  source: { dataset: 'Lancaster Sensorimotor Norms (Lynott et al., 2020)', doi: '10.3758/s13428-019-01316-z', osf: 'https://osf.io/7emr6/' },
  reproduction: {
    words: rep.words,
    maximumPerceptualStrength: { exact: rep.maxExact, worstAbsoluteDelta: rep.maxWorst },
    modalityExclusivity: { exact: rep.exclExact, worstAbsoluteDelta: rep.exclWorst },
    dominantPerceptualModality: { exact: rep.domExact, differingByTieBreak: rep.domTied, differingGenuinely: rep.domGenuine },
    tolerance: TOLERANCE,
  },
  reliabilityOfMeans: reliabilities,
  preregistered: {
    confirmatory: primary,
    sensitivityBlankAsZero: sensitivity,
    H2: { byChannel: h2, machineHigherOnEveryChannel: machineHigherEverywhere },
  },
  exploratory: {
    allWords,
    // The pilot's head correlation, to three places as the pilot reported it.
    headChannel: { all300: allWords.perChannel.head, pilotPearson60: Math.round(pilotCriterion.criterion.perDimension.head.r * 1000) / 1000 },
    modelStabilityOnOverlap: { words: overlap.length, byChannel: stability },
    h2OnAllWords: { byChannel: h2AllWords, machineHigherOnEveryChannel: h2AllWordsHigherEverywhere },
    h1bWithAllWordsReliabilities: { corrected: h1bAllWords, verdict: h1bAllWordsVerdict, reliabilitiesOfMeans: reliabilitiesAllWords },
    zerosAndLevels: {
      cells: zeroCells,
      machineMeanZero: zeroMachine,
      humanMeanZero: zeroHuman,
      byChannel: zerosAndLevels,
    },
  },
};
writeFileSync(resolve(here, 'criterion-results.json'), `${JSON.stringify(summary, null, 2)}\n`);

// The per-word values behind every correlation above, so a figure or a reader
// can plot or recheck them without recomputing the panel's means.
const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : null);
const perWord = allRows.map((r) => ({
  word: r.word,
  set: setOf.get(r.word),
  machine: Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, round3(r.m[d])])),
  human: Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, round3(r.h[d])])),
})).sort((a, b) => a.word.localeCompare(b.word));
writeFileSync(resolve(here, 'panel-vs-human.json'), `${JSON.stringify(perWord, null, 1)}\n`);
process.stdout.write('\nWrote criterion-results.json\n');
