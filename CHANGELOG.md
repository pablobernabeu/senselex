# Changelog

All notable changes to SenseLex are recorded here, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/). Anything that can change a computed
norm or a reported number is listed with its reason.

## [Unreleased]

### Changed

- The rating task now uses the wording of the Lancaster Sensorimotor Norms'
  published rating screens. Every channel is rated from 0 (not at all) to 5
  (greatly), a channel through which a word is not experienced is a 0 and not a
  blank, and the head effector reads "head excluding mouth". The previous
  wording invited blanks for channels that "do not apply" and labelled the
  effector "head", which let speaking and eating earn head credit the published
  norms assign to the mouth. Ratings collected under the two wordings should not
  be pooled without checking.
- Single-rater reliability is estimated with split halves of a fixed size. The
  earlier estimator split each word's own raters in half, so the half size varied
  across words, which biased the estimate downwards. The change was made, and
  disclosed as Amendment 1 in `validation/PREDICTIONS.md`, before the 300-word
  panel was collected.
- The pilot panel and its outputs moved to `validation/pilot/`.
- The Docker base image is pinned by digest.
- `CITATION.cff` points to the public repository and the concept DOI.

### Added

- A preregistered 300-word simulated-rater panel (`validation/PREDICTIONS.md`,
  `raters.json`) and its analysis in `criterion.mjs`: hypotheses H1, H1b, H2 and
  H3, a sensitivity analysis and labelled exploratory analyses.
- `validation/human_benchmark.mjs`: reproduction of the published Lancaster means
  from the 10.5 million individual ratings, human single-rater reliability on the
  panel's words, and the raters per word a new study needs for each channel.
- `validation/lancaster.mjs`: the Lancaster files' storage addresses and the
  SHA-256 checksums OSF publishes, checked by every script before a file is used.
- `validation/verify.mjs` and `npm run verify`, which rerun the whole validation
  in a scratch copy and compare every output with the committed file.
- `npm run validate`, which reruns the analyses in place.
- `.node-version`, recording the Node release that produced the committed
  validation results.
- `test/stats.test.js`, checking the validation statistics against hand-worked
  values.
- Continuous integration (`.github/workflows/ci.yml`): the unit tests on Node 22
  and 24.12.0, and the reproduction check on every push.
- `data/requirements.txt`, pinning the Python packages that build the word banks.
- A codebook for the validation data files in `validation/README.md`.
- Input checks that stop a validation run on an incomplete or duplicated panel,
  a word missing from the Lancaster norms, a reordered or renamed column, an
  empty or non-numeric rating, or two published rows with the same word, each of
  which would otherwise have produced plausible but wrong numbers.

### Fixed

- `validation/compute.mjs` wrote empty count columns in its CSV export.
- An exploratory measure in `human_benchmark.mjs` read an undefined modality
  exclusivity as 0. No reported number used that measure, and on the Lancaster
  data no exclusivity is undefined, so its output is unchanged.
- `ratersFor` in `validation/stats.mjs` could return one rater too many when the
  exact answer was a whole number, because floating-point division left it a
  hair above the integer before rounding up. None of the reported figures lies
  near a whole number, so none changes.
- `npm test` counted `test/helpers.js` as a test and now runs only the
  `*.test.js` files.

## [0.0.1] - 2026-09-22

First public release, archived at https://doi.org/10.5281/zenodo.22905874.

[Unreleased]: https://github.com/pablobernabeu/senselex/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/pablobernabeu/senselex/releases/tag/v0.0.1
