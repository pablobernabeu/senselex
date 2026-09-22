// Statistics shared by every validation script, so that a figure computed for
// the machine panel and the same figure computed for the human norms come from
// one implementation. Comparing a machine reliability with a human one is only
// meaningful if nothing but the raters differs.
//
// No dependencies: the suite's zero-dependency rule extends to its analyses.

// mulberry32, a small deterministic generator. Its statistical quality is ample
// for shuffling raters and resampling words, and a fixed seed makes every
// random split and bootstrap reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace(array, rand) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function sd(xs) {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

export function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function pearson(xs, ys) {
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

// Ranks with ties given their average rank, as Spearman's rho requires.
function ranks(xs) {
  const order = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(xs.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = r;
    i = j + 1;
  }
  return out;
}

// Spearman's rho, reported beside Pearson's r because Xu et al. (2025), the
// study the 300-word panel tests, reported rank correlations.
export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

// Fisher-z interval for a correlation.
export function fisherCi(r, n) {
  if (r === null || n < 4) return null;
  const z = Math.atanh(r);
  const se = 1 / Math.sqrt(n - 3);
  return [Math.tanh(z - 1.96 * se), Math.tanh(z + 1.96 * se)];
}

// Percentile bootstrap over the rows of a dataset. `statistic` receives an array
// of resampled rows and returns a number.
export function bootstrap(rows, statistic, { resamples = 10000, seed = 20260923 } = {}) {
  const rand = mulberry32(seed);
  const values = [];
  const sample = new Array(rows.length);
  for (let b = 0; b < resamples; b += 1) {
    for (let i = 0; i < rows.length; i += 1) sample[i] = rows[Math.floor(rand() * rows.length)];
    const v = statistic(sample);
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  values.sort((a, b) => a - b);
  const at = (p) => values[Math.min(values.length - 1, Math.max(0, Math.floor(p * values.length)))];
  return { estimate: statistic(rows), ci: [at(0.025), at(0.975)], resamples: values.length };
}

// Spearman-Brown: the reliability of a mean of k raters, given the reliability
// of one. Stepping down (k < 1 in effect) is the same formula solved for r1.
export const spearmanBrown = (r1, k) => (k * r1) / (1 + (k - 1) * r1);
export const singleRaterFrom = (rk, k) => rk / (k - (k - 1) * rk);

// Raters needed for a mean to reach a target reliability, from the single-rater
// value. Returns null when a single rater is already unreliable enough that no
// finite panel would do, which the formula signals by a non-positive r1.
export function ratersFor(r1, target) {
  if (!(r1 > 0) || r1 >= 1) return r1 >= 1 ? 1 : null;
  return Math.ceil((target * (1 - r1)) / (r1 * (1 - target)));
}

// Single-rater reliability of one rating dimension, estimated the same way for
// any panel. For each word, 2k of its ratings are drawn at random and split into
// two halves of k; the half means are correlated across words, and that
// correlation, which is the reliability of a k-rater mean, is stepped down to one
// rater with Spearman-Brown. Averaged over many random splits so that no one split
// decides the figure.
//
// The half size is fixed, and words with fewer than 2k ratings are left out. An
// earlier version split each word's own raters in half, so the half size varied
// from word to word, and stepped down using the mean half size. Because a mean's
// reliability rises less than linearly with the number of raters, averaging over
// unequal halves pulls the split-half correlation below the value at the mean
// size, and the single-rater estimate came out too low: on the Lancaster data it
// predicted .70 for an eight-rater mean of touch ratings where two disjoint
// eight-rater means actually correlated at .76. A fixed half size removes the
// mixture. Six is the default because the simulated panel has twelve raters.
//
// `ratingsByWord` holds one array per word of that word's individual ratings.
export function singleRaterReliability(ratingsByWord, { halfSize = 6, splits = 200, seed = 20260923 } = {}) {
  const k = halfSize;
  const words = ratingsByWord.filter((r) => r.length >= 2 * k);
  if (words.length < 10) return null;
  const rand = mulberry32(seed);
  const estimates = [];
  for (let s = 0; s < splits; s += 1) {
    const a = [];
    const b = [];
    for (const ratings of words) {
      const pool = shuffleInPlace([...ratings], rand);
      a.push(mean(pool.slice(0, k)));
      b.push(mean(pool.slice(k, 2 * k)));
    }
    const r = pearson(a, b);
    if (r !== null) estimates.push(r);
  }
  const rk = mean(estimates);
  return { r1: singleRaterFrom(rk, k), rk, halfSize: k, words: words.length, splits: estimates.length };
}

// The reliability of a set of per-word means whose words rest on different
// numbers of raters. The error variance of a word's mean is proportional to one
// over its rater count, so the average error across words corresponds to the
// harmonic mean of the counts, not the arithmetic mean.
export function reliabilityOfMeans(r1, raterCounts) {
  const counts = raterCounts.filter((n) => n > 0);
  const harmonic = counts.length / counts.reduce((a, n) => a + 1 / n, 0);
  return { reliability: spearmanBrown(r1, harmonic), harmonicRaters: harmonic };
}

// Spearman's (1904) correction for attenuation: the correlation two measures
// would show if both were perfectly reliable. No predictor can correlate with a
// criterion more strongly than the criterion's own reliability allows, so an
// observed agreement is only interpretable against that ceiling.
export const disattenuate = (r, relA, relB) => r / Math.sqrt(relA * relB);
