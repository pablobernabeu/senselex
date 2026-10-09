# Changelog

All notable changes to SenseLex are recorded here, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/). Anything that can change a computed
norm, an export, the rating instrument or a reported number is listed with its
reason.

## [Unreleased]

## [0.2.0] - 2026-10-09

This release brings every rating surface in line with the wording of the
Lancaster Sensorimotor Norms, records a word the rater does not know, and adds
three validation studies: a reproduction of the Lancaster norms from their
trial-level ratings, an estimate of how many raters a norming study needs on each
channel, and a preregistered panel of twelve simulated raters who each rated 300
English words. Every validation input is checked against its published checksum
and expected structure, and one command reruns the validation and compares each
output with the committed file.

### Changed

- The rating task uses the wording of the Lancaster Sensorimotor Norms rating
  screens (Lynott et al., 2020) in the browser edition, the jsPsych experiment it
  exports, the standalone jsPsych plugin and the Atlas contribution form. Raters
  are asked "To what extent do you experience this word?" and rate every channel
  from 0 (not at all) to 5 (greatly). A channel through which the word is not
  experienced is a 0, not a blank. The perceptual rows read "By feeling through
  touch", "By hearing", "By smelling", "By tasting", "By seeing" and "By
  sensations inside your body", and the head effector reads "Head excluding
  mouth". The previous instructions asked raters to leave a channel blank if it
  did not apply, anchored the top of the scale at "very strongly" and labelled the
  effector "Head", which let speaking and eating earn head credit that the
  published norms assign to the mouth. Ratings collected under the two wordings
  should not be pooled without checking. The rating fields still accept half
  points where Lancaster used whole numbers.
- A word the rater does not know is recorded. The browser edition's collection
  screen separates moving on ("Next", which records nothing) from recording an
  item as unknown ("Don't know this word", or "No name given" when naming). An
  item recorded as unknown counts towards completing a session, so a Prolific
  session can finish, but it never enters the norms, and a session made only of
  unknown items does not finish. Answering the item later replaces the record.
  Unknown items travel in the dataset JSON (`skips`) and merge on import, where
  an answer in the merged data supersedes them. They are not submitted to an
  Atlas, which does not yet store them.
- The jsPsych plugin `senselex-rating`, standalone and in the exported
  experiment, is version 2.0.0. It has a "Don't know this word" button, which ends
  the trial with `dont_know: true` and no ratings. jsPsych 8 stores the plugin
  version with every trial, so trials from the two wordings can be told apart
  (under jsPsych 7, the `dont_know` field marks version-2 trials).
  The exported experiment writes don't-know trials to `skips`, not `ratings`.
- Records the browser edition saves carry the release that saved them
  (`appVersion`), the long-format CSV export has an `app_version` column, the
  page shows the release, and the dataset JSON records which release exported it
  (`exportedWith`). The Atlas does not yet store a release, so ratings it
  received under the two wordings can be separated only by when they arrived.
- The demonstration sample of ratings rates every channel, with 0 where a word is
  not experienced, as the instructions ask.
- The browser edition and the README no longer claim that the browser edition's
  exports carry a licence: only the Atlas's export does, in its metadata file.
  The README now states that `web-static/words.js` is not covered by the MIT
  licence: its frequencies derive from wordfreq data, distributed under CC BY-SA
  4.0, and the file is shared under that licence.
- The simulated panel's reliability is reported per channel as single-rater
  reliability, estimated with the same function as for the Lancaster raters
  (`validation/stats.mjs`): two halves of six ratings per word, averaged over 200
  seeded random splits and stepped down with the Spearman-Brown formula.
  `validation/compute.mjs` no longer computes the measures reported for the pilot
  in v0.0.1, namely the Spearman-Brown reliability of the twelve-rater mean from
  one odd/even split of raters, the mean pairwise inter-rater correlation and the
  correlation of maximum perceptual strength with concreteness. The pilot's
  values remain in `validation/pilot/results-pilot.json`.
- Records in the exported validation dataset are identified as
  `panel-<rater>-<CONCEPT>` (previously `llmval-...`) and stamped with the panel's
  collection date from `raters.json`. The `SENSELEX_VALIDATION_TIMESTAMP`
  override has been removed.
- `validation/sample_words.mjs` draws 300 words, six concreteness bands of 50,
  from words that appear in the Lancaster norms and have a Zipf frequency above
  zero. It keeps the 54 pilot words that pass these filters as an overlap set and
  needs the Lancaster norms file to run. It no longer regenerates the pilot's
  60-word sample, which is kept as `validation/pilot/words-sample-pilot.json`.
- The simulated-rater prompt (`validation/rater-prompt.md`) follows the Lancaster
  wording, asks for whole numbers and offers a "don't know" response. Each rater
  rates five lists of 60 words, one isolated call per list.
- The pilot panel and all its outputs moved, unchanged, to `validation/pilot/`.
- The minimum Node release is 22.13, the first 22.x release that provides
  `node:sqlite` without the `--experimental-sqlite` flag. The earlier stated
  minimum, 22.5, needed that flag.
- `docker-compose.yml` passes the audit secret and the request limits through
  from `.env`, and `.env.example` says how to load the file without Docker.
- `SECURITY.md` asks for vulnerabilities to be reported through GitHub's private
  vulnerability reporting.
- The Docker base image is pinned by digest
  (`node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`).
- `CITATION.cff` points to https://github.com/pablobernabeu/senselex and to the
  concept DOI 10.5281/zenodo.22905873, gives the release date, and cites both
  word-bank sources.

### Added

- The preregistered 300-word simulated-rater panel: the plan
  (`validation/PREDICTIONS.md`), the seeded per-rater word lists
  (`make_lists.mjs`, `panel-lists.json`), the collection script
  (`run_panel.workflow.js`) and the raw ratings (`raters.json`, model
  `claude-opus-5-5`), committed before any analysis ran.
- The panel's analysis in `validation/criterion.mjs`: hypotheses H1, H1b, H2 and
  H3 on the 246 confirmatory words, a sensitivity analysis that reads blank
  channels as 0, and exploratory analyses labelled as such. H2 compares the two
  panels on the same words, and H1b uses reliabilities from the same word set.
  Per-word panel and human means are written to `validation/panel-vs-human.json`.
  The analysis script made public with the preregistration amendment computed H2
  and the H1b reliabilities on all 300 words, with slightly different word sets
  for the two panels, while the preregistration's text puts every test on the
  confirmatory words. This release follows the text, a choice made after the
  data were collected. The script's computations are kept as labelled exploratory
  outputs and reach the same verdicts.
- `validation/human_benchmark.mjs` reproduces the published Lancaster means from
  the trial-level ratings. Where a word's published means differ from its own
  ratings, it checks whether they match another word's ratings. It also estimates
  human single-rater reliability on the panel's words and across the lexicon, and
  gives the number of raters per word a new study needs to reach a target
  reliability on each channel.
- `validation/stats.mjs`, the statistics and the preregistered seed shared by
  every validation script.
- `validation/lancaster.mjs`, with the storage addresses of the two Lancaster
  files and the SHA-256 checksums OSF publishes for them. Every script that reads
  a Lancaster file checks its checksum first and stops on a mismatch. The files
  are read from `SENSELEX_DATA_DIR` (default `validation/`).
- `npm run verify` (`validation/verify.mjs`) reruns the validation steps in a
  scratch copy and compares each output with the committed file. Without the
  1.4 GB trial file it skips `human_benchmark.mjs` and says so, and
  `--require-trial` turns that into a failure. `npm run validate` reruns
  `compute.mjs`, `human_benchmark.mjs` and `criterion.mjs` in place.
- Input checks that stop a validation run on an incomplete or duplicated panel,
  a sample word missing from the Lancaster norms, a missing or renamed column, an
  empty or non-numeric rating, a quoted field in the trial file, or two published
  rows with the same word. Columns are located by name.
- `.node-version`, recording Node 24.12.0, the release that produced the
  committed validation results.
- `validation/panel-transcript-audit.json`, written by
  `validation/audit_panel_transcripts.mjs` from the collection run's transcripts:
  for each of the 60 rater calls, the tools offered, the tools called and the
  kinds of context received.
- Tests of the validation statistics against hand-worked values
  (`test/stats.test.js`), and of the jsPsych plugin's save and don't-know paths.
- Continuous integration (`.github/workflows/ci.yml`) runs the unit tests on Node
  22.13.0, the newest Node 22 and 24.12.0, and runs `npm run verify` with the
  Lancaster norms file but without the trial file on every push and pull request.
- `data/requirements.txt`, pinning the direct Python dependencies of
  `data/build_wordbanks.py` at the versions installed on 23 September 2026. The
  committed word banks were built in July 2026 with versions that were not
  recorded, so a rebuild may not reproduce `web-static/words.js` exactly.
- A codebook and step-by-step reproduction instructions in `validation/README.md`,
  and `ISSUES.md`, which lists the open issues and why each was deferred.

### Fixed

- The jsPsych experiment exported by the browser edition never started: it
  loaded jsPsych from jsDelivr's bare package addresses, which serve the Node
  build, and browsers refuse to run that. It now loads the browser bundles of
  jsPsych 8.3.0 and plugin-html-button-response 2.1.0, with integrity hashes.
- On a study link, a participant who skipped a word could never reach the
  completion screen or the Prolific return link, because a skip recorded nothing.
  Recording a word as unknown now counts towards completion. On a study link
  with an Atlas address, the session also needs at least one rating, since only
  ratings are submitted.
- `validation/compute.mjs` passed a record count where the CSV export expects
  per-channel counts. As a result `llm-norms-eng.csv` had empty `n_records` and
  `n_perceptual_channels` columns and a 0 in every `n_<channel>` column. The
  300-word export carries the correct counts. The pilot's export, kept as
  released in `validation/pilot/llm-norms-eng-pilot.csv`, still has the defect.
- `npm test` ran `test/helpers.js` as a test file. It now runs only
  `test/*.test.js`.

### Preregistration

The hypotheses, sample and analysis plan for the 300-word panel, and Amendment 1
to them (`validation/PREDICTIONS.md`), were made public on the `prereg-panel-300`
branch of this repository on 22 September 2026, UTC (commits 668d017 and
ab874da),
before any rating was collected. The amendment was informed by the human
trial-level data and not by any machine rating. It fixed the size of the split
halves used for H2 and added H1b. The copy of `validation/rater-prompt.md` made
public then omitted the prompt's final paragraph, which tells the rater how to
return its answers, to give null ratings for a word marked as unknown and to use
no other tool. The collection script preregistered with it held the complete
prompt, and this release restores the paragraph to the file.

Two points depart from the plan. First, the preregistration specified rater
calls without tools, but each call ran as a subagent of an AI coding assistant,
with that assistant's standard tools and context available. The prompt told each
rater to use no other tool than the one that returns its answers, and the
transcript audit shows that every call made exactly that one tool call. Second,
the preregistration's text and its analysis script disagreed on the words H2 and
the H1b reliabilities use, and the text was followed after the data were
collected, as described above.

## [0.0.1] - 2026-09-22

First public release, archived at https://doi.org/10.5281/zenodo.22905874. Its
`package.json`, `CITATION.cff` and `docker-compose.yml` gave the version as 0.1.0
in error. Anything labelled 0.1.0 is this release, which is why the next release
is 0.2.0.

[Unreleased]: https://github.com/pablobernabeu/senselex/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/pablobernabeu/senselex/compare/v0.0.1...v0.2.0
[0.0.1]: https://github.com/pablobernabeu/senselex/releases/tag/v0.0.1
