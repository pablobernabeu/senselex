// Draw the word sample for the computational validation study: 60 English
// words from the app's own curated bank, stratified across the concreteness
// range (six bands) and spread across the frequency range within each band,
// so the sample spans the space the instrument is meant to measure rather
// than clustering at concrete, common words. Every word carries its human
// concreteness rating (Brysbaert, Warriner & Kuperman, 2014) from the bank,
// which is what the machine-generated norms are later correlated against.
//
// Run:  node validation/sample_words.mjs   (from the software directory)
// Writes: validation/words-sample.json

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bankSource = readFileSync(resolve(here, '../web-static/words.js'), 'utf8');

const windowShim = {};
new Function('window', bankSource)(windowShim);
const bank = windowShim.SENSELEX_WORDBANK?.banks?.eng?.words;
if (!Array.isArray(bank) || bank.length === 0) {
  throw new Error('English bank not found in web-static/words.js');
}

// Entries are [word, concreteness, zipf]; keep only words with both features.
const usable = bank.filter(
  (w) => typeof w[1] === 'number' && typeof w[2] === 'number',
);

const BANDS = 6;
const PER_BAND = 10;
const lo = 1;
const hi = 5;
const width = (hi - lo) / BANDS;

const sample = [];
for (let b = 0; b < BANDS; b += 1) {
  const min = lo + b * width;
  const max = b === BANDS - 1 ? hi + 0.001 : lo + (b + 1) * width;
  const band = usable
    .filter((w) => w[1] >= min && w[1] < max)
    .sort((a, c) => a[2] - c[2]);
  const take = Math.min(PER_BAND, band.length);
  const step = band.length / Math.max(1, take);
  for (let i = 0; i < take; i += 1) sample.push(band[Math.floor(i * step)]);
}

// Top up from the whole pool if any band ran short, preferring unused words
// spread across concreteness.
if (sample.length < BANDS * PER_BAND) {
  const used = new Set(sample.map((w) => w[0]));
  const rest = usable
    .filter((w) => !used.has(w[0]))
    .sort((a, c) => a[1] - c[1]);
  const need = BANDS * PER_BAND - sample.length;
  const step = rest.length / need;
  for (let i = 0; i < need; i += 1) sample.push(rest[Math.floor(i * step)]);
}

sample.sort((a, c) => a[0].localeCompare(c[0]));

const out = {
  language: 'eng',
  source: 'web-static/words.js (curated bank; concreteness from Brysbaert et al., 2014; Zipf from wordfreq)',
  design: `${BANDS} concreteness bands x ${PER_BAND} words, frequency-spread within band`,
  items: sample.map(([word, concreteness, zipf]) => ({ word, concreteness, zipf })),
};

mkdirSync(here, { recursive: true });
writeFileSync(resolve(here, 'words-sample.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote words-sample.json with ${out.items.length} words`);
console.log('concreteness range:', sample[0] && Math.min(...sample.map((w) => w[1])), 'to', Math.max(...sample.map((w) => w[1])));
