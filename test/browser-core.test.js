// The browser edition has to run from a file:// URL with no build step, so it
// cannot import the domain core and carries a copy instead. A copy that is only
// checked by eye drifts: before this test existed, the two implementations had
// already diverged on how free-naming responses are counted, so the same data
// gave agreement 1.00 and one distinct name in the browser and 0.00 and two on
// the server.
//
// This test extracts the copy from between the markers in web-static/index.html,
// evaluates it as a browser would, and asserts that every function agrees with
// src/domain/norms.js across a fixture set including the awkward cases: partial
// vectors, all-zero vectors, single raters and case-variant names. A change to
// one side that is not mirrored on the other fails here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  averageRatings,
  ratedCounts,
  dominantModality,
  modalityExclusivity,
  ratedChannelCount,
  simpsonDiversity,
  agreement,
} from '../src/domain/norms.js';
import { PERCEPTUAL_DIMENSIONS, ALL_DIMENSIONS } from '../src/domain/dimensions.js';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = resolve(here, '../web-static/index.html');

const BEGIN = '// ----- SENSELEX-CORE-BEGIN -----';
const END = '// ----- SENSELEX-CORE-END -----';

function loadBrowserCore() {
  const html = readFileSync(PAGE, 'utf8');
  const start = html.indexOf(BEGIN);
  const end = html.indexOf(END);
  assert.ok(start !== -1 && end > start, 'the browser edition must keep its core markers');
  const source = html.slice(start + BEGIN.length, end);
  // Evaluated in its own scope and asked to hand back the functions under test.
  const factory = new Function(`${source}
    return { PERCEPTUAL, ALL, averageRatings, ratedCounts, dominantModality,
             modalityExclusivity, ratedChannelCount, simpsonDiversity, agreement, tally };`);
  return factory();
}

const browser = loadBrowserCore();

const VECTOR_FIXTURES = [
  // A complete vector.
  [{ touch: 1, hearing: 0, smell: 4, taste: 5, vision: 2, interoception: 1, mouth_throat: 0, hand_arm: 2, foot_leg: 0, head: 1, torso: 0 }],
  // Partial vectors, the case the two copies used to disagree about.
  [{ vision: 4, hearing: 3 }, { vision: 4, hearing: 3 }],
  [{ vision: 4, hearing: 3 }, { vision: 2, smell: 1 }],
  // Every rated channel at zero, which has no dominant modality.
  [{ touch: 0, hearing: 0, smell: 0, taste: 0, vision: 0, interoception: 0 }],
  // One rated channel, which leaves the exclusivity range undefined.
  [{ vision: 4 }],
  // Action channels only, so no perceptual channel was rated at all.
  [{ hand_arm: 5, foot_leg: 2 }],
  // A single rater.
  [{ smell: 5, taste: 4, vision: 2 }],
  // Half-point ratings, which the interface allows.
  [{ vision: 3.5, hearing: 1.5, touch: 0.5 }, { vision: 4.5, hearing: 2.5, touch: 1.5 }],
];

test('the browser edition keeps the core markers and exports the same functions', () => {
  for (const name of ['averageRatings', 'dominantModality', 'modalityExclusivity', 'simpsonDiversity', 'agreement']) {
    assert.equal(typeof browser[name], 'function', `${name} must exist in the browser copy`);
  }
  assert.deepEqual(browser.PERCEPTUAL, [...PERCEPTUAL_DIMENSIONS]);
  assert.deepEqual(browser.ALL, [...ALL_DIMENSIONS]);
});

test('browser and server compute identical sensorimotor norms', () => {
  for (const vectors of VECTOR_FIXTURES) {
    const label = JSON.stringify(vectors);

    const serverAverage = averageRatings(vectors, ALL_DIMENSIONS);
    const browserAverage = browser.averageRatings(vectors, browser.ALL);
    assert.deepEqual(browserAverage, serverAverage, `averageRatings differs for ${label}`);

    assert.deepEqual(
      browser.ratedCounts(vectors, browser.ALL),
      ratedCounts(vectors, ALL_DIMENSIONS),
      `ratedCounts differs for ${label}`,
    );

    assert.deepEqual(
      browser.dominantModality(browserAverage, browser.PERCEPTUAL),
      dominantModality(serverAverage, PERCEPTUAL_DIMENSIONS),
      `dominantModality differs for ${label}`,
    );

    assert.equal(
      browser.modalityExclusivity(browserAverage, browser.PERCEPTUAL),
      modalityExclusivity(serverAverage, PERCEPTUAL_DIMENSIONS),
      `modalityExclusivity differs for ${label}`,
    );

    assert.equal(
      browser.ratedChannelCount(browserAverage, browser.PERCEPTUAL),
      ratedChannelCount(serverAverage, PERCEPTUAL_DIMENSIONS),
      `ratedChannelCount differs for ${label}`,
    );
  }
});

test('browser and server count naming responses the same way', () => {
  const NAME_FIXTURES = [
    ['smoky', 'smoky', 'acrid'],
    ['Smoky', 'smoky', ' smoky '],
    ['acrid'],
    ['a', 'b', 'c'],
    ['burnt wood', 'burnt wood', 'burnt Wood'],
  ];
  for (const names of NAME_FIXTURES) {
    const label = JSON.stringify(names);
    const browserCounts = browser.tally(names);
    // The server tallies through codability, which applies the same
    // normalisation; comparing the count objects directly keeps the check on the
    // one thing that differed.
    const serverCounts = {};
    for (const name of names) {
      const key = String(name).trim().toLowerCase();
      if (key) serverCounts[key] = (serverCounts[key] || 0) + 1;
    }
    assert.deepEqual(browserCounts, serverCounts, `tally differs for ${label}`);
    assert.equal(browser.simpsonDiversity(browserCounts), simpsonDiversity(serverCounts), `diversity differs for ${label}`);
    assert.equal(browser.agreement(browserCounts), agreement(serverCounts), `agreement differs for ${label}`);
  }
});
