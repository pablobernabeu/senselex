// Draw the word sample for the simulated-rater panel: 300 English words from the
// app's own curated bank, six concreteness bands of 50, spread across the
// frequency range within each band. PREDICTIONS.md sets out why.
//
// Three filters apply before sampling. A word must carry a concreteness rating
// (Brysbaert, Warriner & Kuperman, 2014) and a Zipf frequency, it must appear in
// the Lancaster Sensorimotor Norms so that every machine rating has a human
// counterpart, and its Zipf frequency must be above zero. The last filter drops
// words absent from the wordfreq corpus: a Zipf of zero marks a word the corpus
// never saw, not a rare one, so keeping them would put a floor artefact at the
// bottom of the frequency range the sample claims to span.
//
// The pilot's 60 words are retained where they pass the filters (54 of them), as
// the overlap set that measures stability across model versions; the rest of
// each band is new (the confirmatory set). Selection is deterministic, taking
// evenly spaced words from each band sorted by frequency, so rerunning the
// script reproduces the sample exactly.
//
// Run from the repository root:  node validation/sample_words.mjs
// Reads the pilot sample from validation/pilot/words-sample-pilot.json and the
// Lancaster norms from SENSELEX_DATA_DIR (default: validation/), checked against
// their published checksum (lancaster.mjs).
// Writes validation/words-sample.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifiedLancasterPath, readNormsCsv, columnIndex } from './lancaster.mjs';

const here = dirname(fileURLToPath(import.meta.url));

const BANDS = 6;
const PER_BAND = 50;
const LO = 1;
const HI = 5;
const WIDTH = (HI - LO) / BANDS;

const windowShim = {};
new Function('window', readFileSync(resolve(here, '../web-static/words.js'), 'utf8'))(windowShim);
const bank = windowShim.SENSELEX_WORDBANK?.banks?.eng?.words;
if (!Array.isArray(bank) || bank.length === 0) throw new Error('English bank not found in web-static/words.js');

const norms = readNormsCsv(await verifiedLancasterPath('norms'));
const wordColumn = columnIndex(norms.header, ['Word']).Word;
const lancaster = new Set(norms.rows.map((cells) => cells[wordColumn].toLowerCase()));

const pilot = new Set(
  JSON.parse(readFileSync(resolve(here, 'pilot/words-sample-pilot.json'), 'utf8')).items.map((i) => i.word),
);

// Entries are [word, concreteness, zipf].
const eligible = bank.filter((w) =>
  typeof w[1] === 'number' && typeof w[2] === 'number' && w[2] > 0 && lancaster.has(w[0].toLowerCase()));

function evenlySpaced(list, n) {
  const sorted = [...list].sort((a, b) => a[2] - b[2] || a[0].localeCompare(b[0]));
  if (n >= sorted.length) return sorted;
  const step = sorted.length / n;
  return Array.from({ length: n }, (_, i) => sorted[Math.floor(i * step + step / 2)]);
}

const items = [];
for (let b = 0; b < BANDS; b += 1) {
  const min = LO + b * WIDTH;
  const max = b === BANDS - 1 ? HI + 0.001 : LO + (b + 1) * WIDTH;
  const band = eligible.filter((w) => w[1] >= min && w[1] < max);
  const kept = band.filter((w) => pilot.has(w[0]));
  const fresh = evenlySpaced(band.filter((w) => !pilot.has(w[0])), PER_BAND - kept.length);
  for (const w of kept) items.push({ word: w[0], concreteness: w[1], zipf: w[2], band: b + 1, set: 'overlap' });
  for (const w of fresh) items.push({ word: w[0], concreteness: w[1], zipf: w[2], band: b + 1, set: 'confirmatory' });
}
items.sort((a, b) => a.word.localeCompare(b.word));

const counts = { overlap: items.filter((i) => i.set === 'overlap').length, confirmatory: items.filter((i) => i.set === 'confirmatory').length };
const out = {
  language: 'eng',
  source: 'web-static/words.js (curated bank; concreteness from Brysbaert et al., 2014; Zipf from wordfreq), restricted to words in the Lancaster Sensorimotor Norms with Zipf > 0',
  design: `${BANDS} concreteness bands x ${PER_BAND} words, frequency-spread within band; ${counts.overlap} overlap words from the pilot, ${counts.confirmatory} confirmatory words`,
  items,
};
writeFileSync(resolve(here, 'words-sample.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote words-sample.json: ${items.length} words (${counts.overlap} overlap, ${counts.confirmatory} confirmatory)`);
