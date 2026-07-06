import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  averageRatings,
  dominantModality,
  maximumPerceptualStrength,
  modalityExclusivity,
  simpsonDiversity,
  agreement,
  codability,
} from '../src/domain/norms.js';

test('averageRatings averages each dimension over non-null values', () => {
  const averaged = averageRatings(
    [{ smell: 4, taste: 2 }, { smell: 5, taste: 4 }],
    ['smell', 'taste', 'vision'],
  );
  assert.equal(averaged.smell, 4.5);
  assert.equal(averaged.taste, 3);
  assert.equal(averaged.vision, 0);
});

test('modality exclusivity is 1 for a single-channel word and 0.5 for two equal channels', () => {
  const unimodal = { touch: 0, hearing: 0, smell: 5, taste: 0, vision: 0, interoception: 0 };
  assert.equal(modalityExclusivity(unimodal), 1);
  const bimodal = { touch: 0, hearing: 0, smell: 5, taste: 5, vision: 0, interoception: 0 };
  assert.equal(modalityExclusivity(bimodal), 0.5);
});

test('dominant modality and maximum perceptual strength pick the strongest channel', () => {
  const averaged = { touch: 1, hearing: 0, smell: 4, taste: 5, vision: 2, interoception: 1 };
  assert.deepEqual(dominantModality(averaged), { modality: 'taste', strength: 5 });
  assert.equal(maximumPerceptualStrength(averaged), 5);
});

test('Simpson diversity is 0 for full agreement and 1 for all-distinct responses', () => {
  assert.equal(simpsonDiversity({ acrid: 3 }), 0);
  assert.equal(simpsonDiversity({ a: 1, b: 1, c: 1 }), 1);
  // two of three the same: same-type pairs = 2, denominator = 6, so diversity = 2/3
  assert.ok(Math.abs(simpsonDiversity({ a: 2, b: 1 }) - 2 / 3) < 1e-9);
});

test('agreement is the complement of diversity', () => {
  const counts = { a: 2, b: 1 };
  assert.ok(Math.abs(agreement(counts) + simpsonDiversity(counts) - 1) < 1e-9);
});

test('codability returns agreement, brevity, and response-type shares', () => {
  const responses = [
    { name: 'smoky', responseType: 'source_based', length: 1 },
    { name: 'smoky', responseType: 'source_based', length: 1 },
    { name: 'acrid', responseType: 'abstract', length: 1 },
    { name: 'really bad smell', responseType: 'evaluative', length: 3 },
  ];
  const result = codability(responses);
  assert.equal(result.n, 4);
  assert.equal(result.distinctNames, 3);
  assert.equal(result.meanUtteranceLength, 1.5);
  assert.ok(Math.abs(result.responseTypeProportions.source_based - 0.5) < 1e-9);
  assert.ok(result.agreement > 0 && result.agreement < 1);
});
