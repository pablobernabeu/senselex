# Changelog

All notable changes to SenseLex are recorded here, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow
[Semantic Versioning](https://semver.org/). Anything that can change a computed
norm, an export, the rating instrument or a reported number is listed with its
reason.

## [Unreleased]

### Upgrading from 0.2.0

- The browser edition's Explore tab updates the codability table when a concept
  has one naming response, leaving that concept's agreement blank. Such a
  concept made the table keep its previous rows, possibly another language's.
- A rating or naming response, or a sync holding one, whose `participantRef`
  names a new participant in a language not yet created gets `422` (`Unknown
  language or concept`) instead of `500`, so a study link reports such ratings
  as refused.
- A rating or naming response that is not stored, because it names an unknown
  concept or repeats a stored `clientId`, no longer adds its participant to the
  Atlas's database.
- The column descriptions in the Atlas's metadata export give the rounding to
  three decimals and the leading apostrophe on formula-like values. They say
  that exclusivity depends on the number of perceptual channels instead of
  being bounded by it.
- When `NODE_ENV` is `production`, as in the Docker image, `senselex serve`
  writes a warning to stderr at start-up while `SENSELEX_ADMIN_TOKENS` is unset
  or empty, since any write token can then change languages and concepts.
- When wordfreq is missing, `data/build_wordbanks.py` points to
  `data/requirements.txt` or `wordfreq[cjk]`, which include MeCab and jieba for
  Korean and Chinese. The 0.2.0 command asked for `ja` and `ko` extras, which
  wordfreq does not define, so it installed wordfreq without MeCab or jieba.

### Changed

- The browser edition's on-screen messages match its behaviour. A study link's
  status reads 'nothing waiting to be submitted' instead of 'all submitted' and
  its Prolific notice says that a return link appears when every item is done.
  The prompt for a participant code and the warning for an invalid concept id
  say that combining marks such as Devanagari vowel signs are not allowed. The
  message after loading the sample of ratings says to choose English in Explore,
  and the message after a draw from a word bank points to Collect, since Explore
  lists a word only once it has been rated.

### Security

- With `SENSELEX_ADMIN_TOKENS` set, `POST /v1/languages` and
  `POST /v1/concepts` accept only the admin tokens it lists and refuse a write
  token with `403`, so a study link's token, which participants can read,
  cannot change languages or concepts. The measurement routes accept either
  kind of token. A token in both lists is an admin token, and `senselex serve`
  in production reports such tokens by their audit-log ids.
  `SENSELEX_API_TOKENS` stays required in production.

### Documentation

- The README documents the Atlas's HTTP API route by route. It warns that
  `seed` replaces any language or concept with the same code or identifier and
  writes invented ratings and naming responses that enter the norms and
  exports. It says that the field client sends its queue to the Atlas only when
  the host application calls `sync()`. It also says that the only store that
  comes with the field client keeps the queue in memory, so queued records do
  not survive a restart, and that the suite includes no persistent store or
  packaged desktop application. It says that, in the Atlas's CSV export, the
  leading apostrophe on a cell that would read as a spreadsheet formula, such as
  the word `-ness`, stays in the file, so R and pandas read it as part of the
  value. It says that, without the Lancaster trial-level file, `npm run verify`
  skips `human_benchmark.mjs` and reruns `criterion.mjs` on the committed
  `human-benchmark-results.json`.
- `SECURITY.md` says that input validation refuses unknown rating dimensions and
  drops other unrecognised fields, and it describes what the audit log records
  and that the log is not tamper-evident. It says that the server does not
  itself refuse requests from other origins, so a cross-site form or
  `text/plain` POST still reaches it and is processed. It also says that
  clients behind a reverse proxy share one rate-limit allowance.
- The jsPsych README, the browser edition's README and its help text say that
  the exported experiment reads `PROLIFIC_PID` and the `cc` code and sends
  nothing to the researcher, offering the participant a download of their data
  instead. The help text adds that it does not record `STUDY_ID` or
  `SESSION_ID`. The browser edition's README documents its export formats and
  what a study link needs from an Atlas.
- The browser edition's help text describes the Explore table, its filters
  (which the norms CSV ignores), pasted item lists and the languages without a
  word bank. It says that the study builder draws the same words for the same
  settings and that every participant sees the items in list order.
- The word-bank build instructions give the packages that Korean and Chinese
  need, the Stanza model download step and the file names of the profanity
  lists.
- `validation/README.md` describes the panel's word lists, dataset and result
  files and the pilot's files. It warns against importing the panel's dataset
  beside human English ratings. It says which study-related terms the
  transcript audit found in every rater call's context, such as
  'preregistration' in the git status. It no longer says that the audit
  confirms that this context held no prediction, no pilot result and no
  Lancaster value, since a search for these terms does not by itself show this.
- `validation/README.md` documents the verify-trial workflow, which reruns the
  whole validation with the Lancaster trial file on GitHub's runners. Its first
  run reproduced every committed output byte for byte,
  `human-benchmark-results.json` included.

## [0.2.0] - 2026-10-09

This version was not released as a package. The browser edition on main
stamped its records 0.2.0 from 2026-10-09 until 0.3.0.

This release uses the wording of the Lancaster Sensorimotor Norms rating screens
(Lynott et al., 2020) on every rating surface, records a word the rater does not
know and adds three validation studies: a reproduction of the Lancaster norms
from their trial-level ratings, an estimate of how many raters a norming study
needs on each channel and a preregistered panel of twelve simulated raters who
each rated 300 English words.

### Upgrading from 0.0.1

#### Changed results

- The rating task (browser edition, jsPsych export and plugin, Atlas form) uses
  the Lancaster wording, with 'Head excluding mouth', and asks for 0 rather than
  a blank for a channel not experienced (blanks are still accepted). Check
  before pooling ratings across wordings.
- The browser edition's collection screen offers 'Don't know this word' ('No
  name given' when naming), which records the item as unknown, beside 'Next'
  (formerly 'Skip'), which records nothing. Unknown items stay out of the norms
  and out of Atlas submissions.
- The jsPsych plugin `senselex-rating` (standalone and exported) is version
  2.0.0, with a 'Don't know this word' button, and every trial records
  `dont_know`. No parameter hides the button or restores the 1.0.0 row labels.
  The standalone plugin's `preamble` can restore the 1.0.0 instruction.
- In `validation/`, `raters.json`, `words-sample.json`, `results.json`,
  `llm-norms-eng.csv`, `senselex-llm-validation-dataset.json` and
  `criterion-results.json` hold the 300-word panel's sample, ratings and
  results. The pilot's files are in `validation/pilot/`, unchanged, with
  `-pilot` added to each name.
- `validation/compute.mjs` fills the `n_records`, `n_<channel>` and
  `n_perceptual_channels` columns of `llm-norms-eng.csv`, which were empty or 0
  because it passed a record count where the export expects per-channel counts.
  The pilot's copy in `validation/pilot/` keeps the defect.
- `validation/criterion.mjs` tests the preregistered hypotheses H1, H1b, H2 and
  H3 on the confirmatory words, reading blank channels as 0 in a sensitivity
  analysis. Agreement with the Lancaster norms on all 300 words, the analysis
  behind the pilot's main result, is exploratory.
- `validation/compute.mjs` reports the panel's single-rater reliability per
  channel, estimated as for the Lancaster raters. It no longer computes the
  measures reported for the pilot, namely the twelve-rater split-half
  reliability, the mean inter-rater correlation and the correlations with
  concreteness (see `validation/pilot/results-pilot.json`).
- `validation/sample_words.mjs` draws 300 words, six concreteness bands of 50,
  from the English word bank's words in the Lancaster norms with a Zipf
  frequency above zero, keeping the 54 pilot words that pass. It no longer
  regenerates the pilot's 60-word sample.
- The simulated-rater prompt (`validation/rater-prompt.md`) uses the Lancaster
  wording, asks for whole numbers and offers a 'don't know' response.
- The browser edition's sample of ratings ('Load a sample of ratings') rates
  every channel, with 0 where a word is not experienced, so its norms change.

#### Changed interface

- The minimum Node release is 22.13 instead of 22.5. It is the first 22.x
  release that provides `node:sqlite` without the `--experimental-sqlite` flag.
- On a browser edition study link with an Atlas address, a session finishes only
  once the participant has rated at least one word, whichever task is selected,
  since only ratings are submitted.
- Under `docker compose`, `SENSELEX_AUDIT_SECRET`, `SENSELEX_MAX_BODY_BYTES`,
  `SENSELEX_MAX_PAGE_SIZE`, `SENSELEX_RATE_WINDOW_MS` and `SENSELEX_RATE_MAX`
  set in `.env` take effect. Remove them from `.env` to keep the defaults.
- The validation scripts stop on a Lancaster file that fails OSF's published
  SHA-256 checksum and on incomplete, duplicated or non-numeric input, such as a
  renamed column or a sample word absent from the Lancaster norms.
- `validation/sample_words.mjs` needs the Lancaster norms file and the pilot
  sample in `validation/pilot/`. `validation/compute.mjs` needs
  `provenance.runDate` in `raters.json` and no longer reads
  `SENSELEX_VALIDATION_TIMESTAMP`. `validation/criterion.mjs` needs
  `human-benchmark-results.json` and the pilot's raters and criterion results in
  `validation/pilot/`.

#### Changed output

- The browser edition's long-format CSV export ends with a new `app_version`
  column, and its dataset JSON, which the exported jsPsych experiment also
  writes, adds `exportedWith`, `appVersion` on records saved from 0.2.0 and a
  `skips` list of items recorded as unknown.
- `validation/criterion-results.json` gives agreement on all words in
  `exploratory.allWords` instead of the top-level `criterion` block, with
  renamed keys such as `perChannel` for `perDimension`, and no longer has
  `machinePanel`.
- The exported validation dataset (`senselex-llm-validation-dataset.json`)
  identifies records as `panel-<rater>-<CONCEPT>` instead of
  `llmval-<rater>-<CONCEPT>` and dates them with the panel's collection date.
- `validation/compute.mjs` prints the record counts and each channel's
  single-rater reliability instead of the full results, which it writes to
  `validation/results.json`.

### Added

- The panel of twelve simulated raters (model `claude-opus-5-5`), each rating
  five lists of 60 English words in separate calls: the word lists
  (`make_lists.mjs`, `panel-lists.json`) and the collection script
  (`run_panel.workflow.js`). The ratings in `raters.json` were committed before
  any analysis ran.
- `validation/PREDICTIONS.md`, the panel's hypotheses, sample and analysis plan
  with Amendment 1, as made public on the `prereg-panel-300` branch on 22
  September 2026, UTC (commits 668d017 and ab874da), before any rating was
  collected. The amendment, informed by the human trial-level data and by no
  machine rating, fixed the size of the split halves for H2 and added H1b. The
  copy of `validation/rater-prompt.md` made public with it lacks the prompt's
  final paragraph, on returning answers, giving null ratings for an unknown word
  and using no other tool. The preregistered collection script and the file in
  this release hold it. H2 and the H1b reliabilities use the confirmatory
  words, as the plan's text says, where its analysis script used all 300 words.
  Following the text was decided after data collection.
  `validation/criterion.mjs` reports the script's computation as exploratory,
  and both reach the same verdicts.
- `validation/panel-transcript-audit.json`, written by
  `validation/audit_panel_transcripts.mjs`, records for each of the 60 rater
  calls the tools offered, the tools called and the kinds of context received.
  The calls, preregistered as calls without tools, ran as subagents of an AI
  coding assistant with its standard tools and context available. Each made
  exactly one tool call, the one that returns its answers.
- `validation/panel-vs-human.json`, written by `validation/criterion.mjs`, holds
  the per-word panel and human means.
- `validation/human_benchmark.mjs`, which writes
  `validation/human-benchmark-results.json`, reproduces the published Lancaster
  means from the trial-level ratings, estimates human single-rater reliability
  and gives the number of raters per word a new study needs to reach a target
  reliability on each channel.
- `npm run verify` reruns the validation in a scratch copy and checks each
  output against the committed file. Without the Lancaster trial-level file, it
  skips the human benchmark, and `npm run verify -- --require-trial` makes that
  a failure.
- `npm run validate` reruns the validation analyses in place.
- `.node-version` records Node 24.12.0, the release that produced the committed
  validation results.
- `data/requirements.txt` pins the direct Python dependencies for rebuilding the
  word banks. The committed banks were built with unrecorded versions, so a
  rebuild may not reproduce `web-static/words.js` exactly.

### Changed

- The standalone jsPsych plugin takes a new optional `dont_know_label`
  parameter, the label of the button that records a word as unknown (default
  'Don't know this word').
- The browser edition shows its release. The Atlas stores no release, so
  ratings submitted to it under the two wordings can be told apart only by when
  they arrived.
- The validation scripts read the Lancaster files from `SENSELEX_DATA_DIR` when
  it is set, and from `validation/` otherwise.
- The Docker base image, `node:24-alpine`, is pinned by digest.

### Fixed

- The jsPsych experiment that the browser edition exports now starts: it loads
  the browser bundles of jsPsych 8.3.0 and plugin-html-button-response 2.1.0,
  with integrity hashes. Unlike the browser edition, it lets a participant mark
  every word as unknown and still reach the Prolific return link, so check the
  data before approving a submission.
- On a study link, a participant who does not know a word can reach the
  completion screen and the Prolific return link by recording the word as
  unknown, provided they answer at least one other item (for a link with an
  Atlas address, see 'Changed interface').

### Documentation

- The README and the browser edition's help text say that the browser edition's
  exports carry no licence, unlike the Atlas's export, and that
  `web-static/words.js` is not covered by the MIT licence. They and the file's
  header say that it keeps the CC BY-SA 4.0 licence of the wordfreq data behind
  its frequencies and that its English concreteness values keep their authors'
  terms.
- The READMEs and help texts no longer say that data exported from the browser
  edition or a jsPsych experiment can be loaded into the full Atlas, which has
  no import for them, or that the Atlas form can play an audio prompt. The
  jsPsych README says that a rated plugin trial passes the Atlas validators once
  its fields are mapped to the Atlas's names.
- `.env.example` says that Node does not read `.env` by itself and how to load
  it without Docker.
- `validation/README.md` has a codebook and step-by-step reproduction
  instructions.

## [0.0.1] - 2026-09-22

First public release, archived at https://doi.org/10.5281/zenodo.22905874. Its
`package.json`, `CITATION.cff` and `docker-compose.yml` gave the version as 0.1.0
in error. Anything labelled 0.1.0 is this release, which is why the version
after it is 0.2.0.

[Unreleased]: https://github.com/pablobernabeu/senselex/compare/1cf6bd9...HEAD
[0.2.0]: https://github.com/pablobernabeu/senselex/compare/v0.0.1...1cf6bd9
[0.0.1]: https://github.com/pablobernabeu/senselex/releases/tag/v0.0.1
