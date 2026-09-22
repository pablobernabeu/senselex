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

const here = dirname(fileURLToPath(import.meta.url));
const LISTS = 5;
const BASE_SEED = 20260923;

// mulberry32, a small deterministic generator; statistical quality is ample for
// ordering a list, and it keeps the script free of dependencies.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const words = JSON.parse(readFileSync(resolve(here, 'words-sample.json'), 'utf8')).items.map((i) => i.word);
const personas = JSON.parse(readFileSync(resolve(here, 'personas.json'), 'utf8')).personas;
if (words.length % LISTS !== 0) throw new Error(`${words.length} words do not divide into ${LISTS} lists`);
const size = words.length / LISTS;

const raters = personas.map((p, r) => {
  const order = shuffled(words, BASE_SEED + r);
  return {
    rater: p.id,
    persona: p.persona,
    lists: Array.from({ length: LISTS }, (_, l) => order.slice(l * size, (l + 1) * size)),
  };
});

writeFileSync(resolve(here, 'panel-lists.json'), `${JSON.stringify({ seed: BASE_SEED, listSize: size, raters }, null, 1)}\n`);
console.log(`wrote panel-lists.json: ${raters.length} raters x ${LISTS} lists of ${size}`);
