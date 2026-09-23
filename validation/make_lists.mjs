// Split the 300-word sample into five lists of 60 for each simulated rater.
//
// Each rater sees every word once, but in its own order and grouped with
// different neighbours, so that position and context effects vary across raters
// instead of being shared by all twelve. The shuffle is seeded per rater, so the
// lists are reproducible. Lancaster participants likewise rated lists of about
// 48 words (Lynott et al., 2020).
//
// Run from the software directory:  node validation/make_lists.mjs
// Writes validation/panel-lists.json.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SEED, mulberry32, shuffleInPlace } from './stats.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const LISTS = 5;

// Rater r's order is seeded with SEED + r, so each rater's order differs and each
// can be regenerated on its own.
const shuffled = (items, seed) => shuffleInPlace([...items], mulberry32(seed));

const words = JSON.parse(readFileSync(resolve(here, 'words-sample.json'), 'utf8')).items.map((i) => i.word);
const personas = JSON.parse(readFileSync(resolve(here, 'personas.json'), 'utf8')).personas;
if (words.length % LISTS !== 0) throw new Error(`${words.length} words do not divide into ${LISTS} lists`);
const size = words.length / LISTS;

const raters = personas.map((p, r) => {
  const order = shuffled(words, SEED + r);
  return {
    rater: p.id,
    persona: p.persona,
    lists: Array.from({ length: LISTS }, (_, l) => order.slice(l * size, (l + 1) * size)),
  };
});

writeFileSync(resolve(here, 'panel-lists.json'), `${JSON.stringify({ seed: SEED, listSize: size, raters }, null, 1)}\n`);
console.log(`wrote panel-lists.json: ${raters.length} raters x ${LISTS} lists of ${size}`);
