# Validation

This folder holds the three validation studies reported in the paper. None
collects data from people. All three reuse the Lancaster Sensorimotor Norms
(Lynott et al., 2020, https://osf.io/7emr6/), which publish per-word means for
39,707 English words together with every individual rating behind them, so none
needed ethical review.

## The three studies

**Study 1, reproduction.** `criterion.mjs` passes the published per-word means
through the suite's own norm functions and compares the output with the
published maximum perceptual strength, modality exclusivity and dominant
modality. `human_benchmark.mjs` goes one step further back: it groups the
10.5 million individual ratings into the per-word vectors SenseLex itself would
receive, averages them with the suite's aggregation function and compares the
result with the published means. Where a word's published means disagree with
its own ratings, it checks whether they match another word's ratings instead.

**Study 2, raters per word.** `human_benchmark.mjs` also estimates single-rater
reliability for each channel over the whole lexicon, by split halves of a fixed
size stepped down with the Spearman–Brown formula, and turns it into the number
of raters a new norming study needs for a target reliability. The projection is
checked directly against disjoint groups of raters at several panel sizes.

**Study 3, a preregistered simulated panel.** Twelve simulated raters, each an
isolated instance of a language model given a lay persona and the Lancaster
instructions, rated 300 words. The hypotheses, sample and analysis were fixed in
`PREDICTIONS.md` and made public on the `prereg-panel-300` branch of
https://github.com/pablobernabeu/senselex before any rating was collected.
`compute.mjs` runs the panel through the production validator and norm
functions, and `criterion.mjs` tests the hypotheses against the human norms.

Machine ratings are never a substitute for human norms and must never be pooled
with them. Every panel record carries `source: "llm-validation"` so that it can
be recognised wherever it travels.

## Reproducing the results

Everything runs on Node 22.5 or newer with no dependencies. The committed
results were produced with Node 24.12.0 (`../.node-version`).

The Lancaster files are not committed, because they carry their own citation
and terms. Download them once into a folder outside any cloud-synchronised
directory, since the trial-level file is 1.4 GB, and point `SENSELEX_DATA_DIR`
at it:

```
curl -L -o "$SENSELEX_DATA_DIR/lancaster-sensorimotor-norms.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/5cc2d6441906ec0017056ba8"
curl -L -o "$SENSELEX_DATA_DIR/lancaster-trial-ratings.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/667d8a53f112ce02e78a6034"
```

Every script checks each file against the SHA-256 that OSF publishes for it
(`lancaster.mjs`) and stops on a mismatch. The short `https://osf.io/download/`
links have been seen to return an empty file, hence the storage addresses above.

From the `software` directory:

```
npm run verify     # rerun every step in a scratch copy and compare with the committed outputs
npm run validate   # rerun compute, human_benchmark and criterion in place
```

`npm run verify` writes nothing in the repository and exits non-zero if any
output differs from the committed file. Without the trial file it skips
`human_benchmark.mjs` and says so, and the flag `--require-trial`
(`node validation/verify.mjs --require-trial`) turns that into a failure. The
trial-level analysis takes a few minutes and up to 6 GB of memory.

Every random step (list order, split halves, bootstrap resamples) is seeded from
the one preregistered seed in `stats.mjs`, and the exported records are stamped
with the panel's collection date, so a rerun reproduces each file byte for byte.

## The steps and their files

| Step | Reads | Writes |
|:---|:---|:---|
| `sample_words.mjs` | the English bank in `../web-static/words.js`, the Lancaster norms, `pilot/words-sample-pilot.json` | `words-sample.json` |
| `make_lists.mjs` | `words-sample.json`, `personas.json` | `panel-lists.json` |
| collection (`run_panel.workflow.js`) | `panel-lists.json`, the prompt in `rater-prompt.md` | `raters.json` |
| `compute.mjs` | `raters.json`, `words-sample.json` | `results.json`, `llm-norms-eng.csv`, `senselex-llm-validation-dataset.json` |
| `human_benchmark.mjs` | both Lancaster files, `words-sample.json` | `human-benchmark-results.json` |
| `criterion.mjs` | the Lancaster norms and every output above, `pilot/` | `criterion-results.json`, `panel-vs-human.json` |

`stats.mjs` holds the statistics every script shares, so that a reliability
computed for the panel and one computed for people come from one
implementation. `lancaster.mjs` holds the file names, addresses, checksums and
CSV reader.

`senselex-llm-validation-dataset.json` imports into the browser edition through
Import under Build and manage. `llm-norms-eng.csv` is in the format the Atlas
exports.

## Codebook

The eleven channel names are the same in every file: the perceptual channels
`touch`, `hearing`, `smell`, `taste`, `vision` and `interoception`, and the action
effectors `mouth_throat`, `hand_arm`, `foot_leg`, `head` (excluding the mouth) and
`torso`. Ratings run from 0 (not at all) to 5 (greatly).

`words-sample.json`, one entry per word in `items`:

| Field | Meaning |
|:---|:---|
| `word` | the word, lower case |
| `concreteness` | mean concreteness, 1 to 5 (Brysbaert et al., 2014) |
| `zipf` | Zipf frequency from wordfreq (Speer, 2022) |
| `band` | concreteness band, 1 (most abstract) to 6 (most concrete) |
| `set` | `confirmatory` (new to any simulated rater) or `overlap` (also rated by the pilot) |

`raters.json`: `provenance` describes the collection (model, provider, run date,
sampling settings, and the files that defined the prompt, personas, lists, sample
and preregistration). `raters` holds one entry per rater, with its `rater` code,
its `persona` and its `ratings`. Each rating has the `word`, the `list` (1 to 5)
and `position` (1 to 60) at which the rater saw it, `dont_know` (true if the rater
did not know the word, in which case no channel is rated), and one field per
channel.

`llm-norms-eng.csv`, one row per word, in the format the Atlas exports:

| Column | Meaning |
|:---|:---|
| `concept_id`, `word` | identifier and word |
| `n_records` | raters who rated the word (those who knew it) |
| `mean_<channel>`, `n_<channel>` | mean rating on a channel and the raters behind it; empty where nobody rated the channel |
| `dominant_modality` | perceptual channel with the highest mean |
| `max_perceptual_strength` | that highest perceptual mean |
| `modality_exclusivity` | range of the perceptual means divided by their sum, 0 to 1 |
| `n_perceptual_channels` | perceptual channels that contributed to the exclusivity |

`panel-vs-human.json`, one entry per word: `word`, `set`, and the per-channel
means of the panel (`machine`) and of the Lancaster raters (`human`), to three
decimal places.

`results.json`, `human-benchmark-results.json` and `criterion-results.json` hold
the statistics reported in the paper, under keys named for what they contain
(for example `preregistered.confirmatory.H1` in `criterion-results.json`).
`paper/make_variables.mjs` in the manuscript repository reads each reported
number from them by its key.

## The panel itself

`raters.json` is the panel's raw output, committed before any analysis ran. Its
`provenance` block records the model, the provider, the run date, that each
rater was an independent call, and that sampling parameters were left at the
provider default. `run_panel.workflow.js` is the script that collected it, kept
so that the collection step is as inspectable as the analysis. The workflow
runtime is not needed to reproduce the panel.

A new panel can be collected with any model, local or hosted, by sending the
prompt in `rater-prompt.md` once per rater per list and recording the replies in
the shape documented there. The prompt follows the Lancaster wording. Every
channel is rated from 0 (not at all) to 5 (greatly), a channel through which a
word is not experienced is a 0 and not a blank, and a word whose meaning the
rater does not know is marked as unknown. Open models run locally make the
workflow free of any external service (Hussain et al., 2024, *Behavior Research
Methods*).

## The pilot

`pilot/` keeps the earlier 60-word panel, which used SenseLex's previous wording
and an earlier model. It is not a result of the paper. `sample_words.mjs` keeps
its words as the overlap set, and `criterion.mjs` uses it only to measure how far
simulated norms move between model versions.
