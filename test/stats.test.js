// The statistics behind the validation studies, checked against values worked by
// hand. Every reliability, interval and corrected correlation the paper reports
// passes through these functions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SEED, mulberry32, shuffleInPlace, pearson, spearman, fisherCi, bootstrap,
  spearmanBrown, singleRaterFrom, ratersFor, singleRaterReliability,
  reliabilityOfMeans, disattenuate,
} from '../validation/stats.mjs';

const close = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('the generator is deterministic for a seed and differs across seeds', () => {
  const a = mulberry32(SEED);
  const b = mulberry32(SEED);
  const c = mulberry32(SEED + 1);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.notDeepEqual(first, [c(), c(), c()]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});

test('a seeded shuffle is a permutation and reproduces', () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const once = shuffleInPlace([...items], mulberry32(SEED));
  assert.deepEqual([...once].sort((x, y) => x - y), items);
  assert.deepEqual(shuffleInPlace([...items], mulberry32(SEED)), once);
});

test('Pearson correlation matches a hand-worked value and rejects degenerate input', () => {
  // x = 1..5, y = 2, 4, 5, 4, 5: sxy = 6, sxx = 10, syy = 6, r = 6 / sqrt(60).
  close(pearson([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]), 6 / Math.sqrt(60));
  assert.equal(pearson([1, 2], [1, 2]), null);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
});

test('Spearman correlation gives tied values their average rank', () => {
  // y ranks 1, 2.5, 2.5, 4 against x ranks 1..4.
  close(spearman([1, 2, 3, 4], [10, 20, 20, 30]), pearson([1, 2, 3, 4], [1, 2.5, 2.5, 4]));
  close(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
});

test('the Fisher-z interval is symmetric in z and needs four pairs', () => {
  const [lo, hi] = fisherCi(0.5, 103);
  close(Math.atanh(0.5) - Math.atanh(lo), 1.96 / 10);
  close(Math.atanh(hi) - Math.atanh(0.5), 1.96 / 10);
  assert.equal(fisherCi(0.5, 3), null);
});

test('Spearman-Brown steps up and down consistently', () => {
  close(spearmanBrown(0.2, 4), 0.8 / 1.6);
  close(singleRaterFrom(spearmanBrown(0.2, 4), 4), 0.2);
  close(spearmanBrown(0.3, 1), 0.3);
});

test('raters needed for a target reliability round up and handle the limits', () => {
  // r1 = .2 reaches .8 at k = .8 * .8 / (.2 * .2) = 16 exactly.
  assert.equal(ratersFor(0.2, 0.8), 16);
  assert.equal(ratersFor(0.21, 0.8), 16);
  assert.ok(spearmanBrown(0.21, 16) >= 0.8 && spearmanBrown(0.21, 15) < 0.8);
  assert.equal(ratersFor(0, 0.8), null);
  assert.equal(ratersFor(1, 0.8), 1);
});

test('the reliability of means uses the harmonic mean of rater counts', () => {
  const { reliability, harmonicRaters } = reliabilityOfMeans(0.2, [10, 30, 0]);
  close(harmonicRaters, 2 / (1 / 10 + 1 / 30));
  close(reliability, spearmanBrown(0.2, 15));
});

test('the correction for attenuation divides by the root of both reliabilities', () => {
  close(disattenuate(0.6, 0.9, 0.4), 0.6 / Math.sqrt(0.36));
});

test('split-half reliability is near 1 for raters who agree and near 0 for noise', () => {
  const rand = mulberry32(7);
  const truth = Array.from({ length: 200 }, () => rand() * 5);
  const agree = truth.map((t) => Array.from({ length: 12 }, () => t + (rand() - 0.5) * 0.01));
  const noise = truth.map(() => Array.from({ length: 12 }, () => rand() * 5));
  assert.ok(singleRaterReliability(agree, { splits: 20 }).r1 > 0.99);
  assert.ok(Math.abs(singleRaterReliability(noise, { splits: 20 }).r1) < 0.1);
  assert.equal(singleRaterReliability(agree.slice(0, 5)), null);
});

test('the bootstrap reproduces for a seed and brackets the estimate', () => {
  const rows = Array.from({ length: 50 }, (_, i) => i);
  const meanOf = (rs) => rs.reduce((a, b) => a + b, 0) / rs.length;
  const a = bootstrap(rows, meanOf, { resamples: 500 });
  const b = bootstrap(rows, meanOf, { resamples: 500 });
  assert.deepEqual(a, b);
  assert.ok(a.ci[0] < a.estimate && a.estimate < a.ci[1]);
});
