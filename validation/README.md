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

**Study 3, a preregistered simulated panel.** Twelve simulated raters, each a
separate call to a language model given a lay persona and the Lancaster
instructions, rated 300 words. The hypotheses, sample and analysis were fixed in
`PREDICTIONS.md` and made public on the `prereg-panel-300` branch of
https://github.com/pablobernabeu/senselex before any rating was collected.
`compute.mjs` runs the panel through the production validator and norm
functions, and `criterion.mjs` tests the hypotheses against the human norms, each
on the 246 confirmatory words as the preregistration specifies. H2 compares the
two panels on the same words: the confirmatory words that both rated at least
twelve times, listed per channel in `human-benchmark-results.json`.

Machine ratings are never a substitute for human norms and must never be pooled
with them. Every rating in `senselex-llm-validation-dataset.json` carries
`source: "llm-validation"` and a participant code from `LLM01` to `LLM12` (the
`rater` codes in `raters.json`), so that it can be recognised.

## Reproducing the results

Everything runs on Node 22.13 or newer with no dependencies. The committed
results were produced with Node 24.12.0 (`../.node-version`).

The Lancaster files are not committed, because they carry their own citation
and terms. Download them once into a folder outside any cloud-synchronised
directory, since the trial-level file is 1.4 GB, and point `SENSELEX_DATA_DIR`
at it:

```
export SENSELEX_DATA_DIR="$HOME/lancaster"   # any folder outside a synchronised directory
mkdir -p "$SENSELEX_DATA_DIR"
curl -fL -o "$SENSELEX_DATA_DIR/lancaster-sensorimotor-norms.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/5cc2d6441906ec0017056ba8"
curl -fL -o "$SENSELEX_DATA_DIR/lancaster-trial-ratings.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/667d8a53f112ce02e78a6034"
```

Without `SENSELEX_DATA_DIR`, the scripts look in `validation/`, where Git ignores
these two files.

Every script checks each file against the SHA-256 that OSF publishes for it
(`lancaster.mjs`) and stops on a mismatch. The short `https://osf.io/download/`
links have been seen to return an empty file, hence the storage addresses above.

From the repository root:

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
| `human_benchmark.mjs` | both Lancaster files, `words-sample.json`, `raters.json` | `human-benchmark-results.json` |
| `criterion.mjs` | the Lancaster norms, `raters.json`, `words-sample.json`, `results.json`, `human-benchmark-results.json`, `pilot/raters-pilot.json`, `pilot/criterion-results-pilot.json` | `criterion-results.json`, `panel-vs-human.json` |

`stats.mjs` holds the statistics every script shares, so that a reliability
computed for the panel and one computed for people come from one
implementation. `lancaster.mjs` holds the file names, addresses, checksums and
CSV reader.

`senselex-llm-validation-dataset.json` imports into the browser edition through
Import under Build and manage. Import it into a browser that holds no human
English ratings (a fresh browser profile, or one cleared with Reset everything
after its data have been exported), because the browser edition
averages every rating of a language whatever its `source`. The browser
edition's CSV exports do not carry `source`, although its trial-level ratings
CSV (`senselex-ratings-long-<code>.csv`) keeps the participant codes `LLM01` to
`LLM12`. `llm-norms-eng.csv` is in the format the Atlas exports.

## Codebook

The eleven channel names are the same in every file: the perceptual channels
`touch`, `hearing`, `smell`, `taste`, `vision` and `interoception`, and the action
effectors `mouth_throat`, `hand_arm`, `foot_leg`, `head` (excluding the mouth) and
`torso`. Ratings run from 0 (not at all) to 5 (greatly).

`words-sample.json`, one entry per word in `items`:

| Field | Meaning |
|:---|:---|
| `word` | the word, lower case |
| `concreteness` | mean concreteness, 1 to 5 (Brysbaert, Warriner & Kuperman, 2014, https://doi.org/10.3758/s13428-013-0403-5) |
| `zipf` | Zipf frequency from wordfreq (Speer, 2022, https://doi.org/10.5281/zenodo.7199437) |
| `band` | concreteness band, 1 (most abstract) to 6 (most concrete) |
| `set` | `confirmatory` (new to any simulated rater) or `overlap` (also rated by the pilot) |

`personas.json`: a `note` and `personas`, one per rater, each with its `id` (the
rater code that `panel-lists.json`, `raters.json` and
`senselex-llm-validation-dataset.json` use) and `persona` (the description put
into the prompt in place of `{PERSONA}`).

`panel-lists.json`: `seed` (the preregistered seed), `listSize` (60) and
`raters`, one per rater, each with its `rater` code, `persona` and `lists`, five
arrays of 60 words in the order the rater saw them. A rating's `list` and
`position` in `raters.json` index into these arrays from 1. The rater at index i
of `personas.json`, counting from 0, was shuffled with `seed` + i.

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

Means, `max_perceptual_strength` and `modality_exclusivity` are rounded to three
decimal places.

`panel-vs-human.json`, one entry per word: `word`, `set`, and the per-channel
means of the panel (`machine`) and of the Lancaster raters (`human`), to three
decimal places.

`senselex-llm-validation-dataset.json` is in the browser edition's dataset
format, with format number `version` (5), which Import does not check. It holds
`languages` (English), `items` (one per sample word), `ratings` (one per rater
and known word) and an empty `responses`. Each item has its `language`, a `conceptId`
(the word upper-cased, with each run of characters other than letters and digits
replaced by `_` and any `_` at either end removed), `gloss` and `word` (both the
word), `concreteness` (a band: `high` from 3.5, `low` up to 2.5, otherwise
`medium`), `concretenessValue` (the mean concreteness in `words-sample.json`) and
`frequency` (its Zipf value). Each rating has `id` (`panel-<rater>-<conceptId>`),
`language`, `conceptId`, `word`, `participant` (the rater code), `dims` (the
ratings by channel), `source` (`llm-validation`) and `ts` (midnight UTC on the
collection date, in milliseconds since 1970). The 43 judgements marked don't know
are not in the file, which has no `skips`. Only `raters.json` records them.

`results.json`, `human-benchmark-results.json` and `criterion-results.json` hold
the statistics reported in the paper. The reliability blocks in `results.json`
and `human-benchmark-results.json` come from `singleRaterReliability` in
`stats.mjs`. For each word, 2k of its ratings on the channel are drawn at random
and split into two halves of k (`halfSize`). The half means are correlated across
words, and `rk`, the mean of that correlation over the random splits that gave
one (`splits` of them), estimates the reliability of a mean of k raters. `r1` is
`rk` stepped down to a single rater with the Spearman–Brown formula. `words`
counts the words with at least 2k ratings on the channel, which are the only
words used. Where `reliabilityOfPublishedMeans` and `harmonicRaters` appear, the
first is `r1` stepped up to the harmonic mean of the words' rater counts on the
channel, and the second is that harmonic mean.

`results.json`, from `compute.mjs`:

| Key | Meaning |
|:---|:---|
| `design` | `raters` and `words`, `recordsValidated` (the records, one per rater and known word, passed through the production validator), `wordsMarkedUnknown` (the judgements marked don't know, 43 of them on 16 distinct words), `blankChannels` (channels left blank in those records) and `provenance`, copied from `raters.json` |
| `reliability.<channel>` | the panel's single-rater reliability, half size 6 over 200 splits, on the words that all twelve raters rated on the channel |
| `structure` | over the panel's word means: the number of words per dominant perceptual modality (`dominantModalityCounts`), the proportion dominated by vision (`visionDominantShare`), the mean, SD, minimum and maximum of `modalityExclusivity` and the mean and SD of `maximumPerceptualStrength` |

`human-benchmark-results.json`, from `human_benchmark.mjs`:

| Key | Meaning |
|:---|:---|
| `source` | the trial-level file read, with its OSF name and SHA-256 |
| `reproduction` | the published means recomputed from individual ratings, over `wordsCompared` words. `wordsReproducingAllEleven`: words whose eleven recomputed means all lie within `tolerance` (`0.000001`) of the published ones. `wordsDiffering`, `largestDifference` and `differences`, one entry per differing word, largest first, giving the channel of its largest difference (`dimension`), the recomputed (`ours`) and `published` means on that channel, the absolute `difference`, the known raters per component (`knownRaters`) and whether the word's published `perception` and `action` means match its own ratings, another word's (`matches <WORD>`) or no word's. `wordsWhosePublishedMeansMatchAnotherWord` counts the differing words whose published means match another word's ratings, `publishedWordsWithTrailingWhitespace` lists the published words matched after trimming and `trialWordsAbsentFromPublished` counts the trial file's words that the published norms leave out. `ratingsRead`: the trial file's rating rows on the eleven channels, including those rated NA. `unknownRatings`: those rows rated NA (the participant did not know the word), counted per row and not per response |
| `humanReliabilityOnPanelWords.<channel>` | Lancaster single-rater reliability, half size 6, on the 300 panel words. `reliabilityOfPublishedMeans` and `harmonicRaters` are taken over all 300 |
| `humanReliabilityOnConfirmatoryWords.<channel>` | the same on the H2 word set, which `wordSet` lists: the confirmatory words that both panels rated at least twelve times on the channel. `reliabilityOfPublishedMeans`, which H1b uses, and `harmonicRaters` are taken over all 246 confirmatory words |
| `designTable.<channel>` | Study 2. `r1` over the whole lexicon, from halves of eight ratings averaged over 50 splits, on the `words` with at least sixteen known ratings on the channel. `ratersFor80` and `ratersFor90`: the raters a mean needs to reach a reliability of .80 and .90. `reliabilityAt`: the projected reliability of a mean of 5, 10, 15 and 20 raters. `empiricalCheck`, keyed by a group size k of 2, 4, 6 and 10: the `observed` correlation between the means of two disjoint groups of k raters, the `predicted` Spearman–Brown value and the `words` with at least 2k ratings |
| `derivedMeasuresBySubsample` | one entry per k of 3, 5, 8, 10 and 12. `maxStrength` correlates, across words, the maximum perceptual strength computed from k randomly drawn Lancaster raters of a panel word with the same measure computed from the word's remaining raters, and `exclusivity` does the same for modality exclusivity. `words` counts the panel words with at least k + 2 known perception responses, the only words used |

`criterion-results.json`, from `criterion.mjs`:

| Key | Meaning |
|:---|:---|
| `source` | the Lancaster release |
| `reproduction` | the published derived columns recomputed from the published means, over all `words`. For `maximumPerceptualStrength` and `modalityExclusivity`: the words within `tolerance` (`0.0005`) of the published value (`exact`) and the largest absolute difference (`worstAbsoluteDelta`). For `dominantPerceptualModality`: the words naming the same modality (`exact`), those that differ where two or more channels share the highest mean (`differingByTieBreak`) and those that differ otherwise (`differingGenuinely`) |
| `reliabilityOfMeans.<channel>` | the reliability of the panel's (`machine`) and the published (`human`) means over the 246 confirmatory words, which H1b corrects for. Each is that panel's single-rater reliability on the H2 word set, stepped up to the harmonic mean of its rater counts |
| `preregistered.confirmatory` | the tests on the confirmatory words (`confirmatoryWords` gives their number), with a blank channel read as not judged: `perChannel` agreement (`n`, `spearman`, `pearson` and `pearsonCi`, a 95% Fisher-z interval), `H1`, `H1b` (`uncorrectedPearsonGap`, `corrected`, `correctedByChannel`) and `H3` (machine minus human `maxStrengthGap` and `exclusivityGap`), each with its `verdict` |
| `preregistered.sensitivityBlankAsZero` | the same with a blank channel read as 0 (identical here, since the panel left no channel blank) |
| `preregistered.H2` | `byChannel` gives the number of `words` in the channel's `wordSet`, the `machine` and `human` single-rater reliability on those words and their `difference`. `machineHigherOnEveryChannel` says whether the machine value is higher on every channel |
| `exploratory` | `allWords`: agreement on all 300 words. `headChannel`: the head channel's agreement on all 300 words beside the pilot's head correlation on its 60 words. `modelStabilityOnOverlap`: pilot against panel means on the overlap words. `h2OnAllWords` and `h1bWithAllWordsReliabilities`: H2 and H1b as computed by the analysis script published with the amendment. `zerosAndLevels`: for each panel, how often each channel's mean is exactly 0 and the channel's mean level |

A bootstrap result gives the full-sample `estimate` and a 95% percentile interval
`ci` from 10,000 resamples seeded with the preregistered seed. `resamples` is the
number of resamples whose statistic was defined.

## The panel itself

`raters.json` is the panel's raw output, committed before any analysis ran. Its
`provenance` block records the model, the provider, the run date, that each
rater was an independent call, and that sampling parameters were left at the
provider default. `run_panel.workflow.js` is the script that collected it, kept
so that the collection step is as inspectable as the analysis. The workflow
runtime is not needed to reproduce the panel.

Each rater call ran as a subagent of an AI coding assistant (Claude Code). Besides
the prompt, it therefore received the assistant's subagent system prompt, the
request that had started the session, the assistant's memory index, a list of its
installed skills and the repository's git status, and it had the assistant's
standard tools, including file reading
and shell commands, in a working directory that held the Lancaster norms. The
preregistration specified calls without tools, and the provenance block in
`raters.json`, which `compute.mjs` copies into `results.json`, repeats that plan. The prompt told each rater to use only the tool
that returns its answers and not to read or search anything.
`panel-transcript-audit.json`, written by `audit_panel_transcripts.mjs` from the
run's transcripts, records for each of the 60 calls how many tools it was
offered and which file and shell tools were among them, the tools it called and
the kinds of context it received: each call made exactly one tool call, the one
that returned its ratings. The script also matches nine study-related terms, each
a regular expression, against the context a call received besides the prompt,
and records which matched and where. Five matched in every call:
`hypothesisLabel`, `preregistration` and `lancaster` in the git status (the
branch and recent commit titles, which named the preregistration, H1b and the
Lancaster protocol), `hypothesis` in the descriptions of the installed skills
and `sensorimotor` in the memory index. `pilot`, `xuEtAl`, `spearman` and
`reliability` never matched. A search for these terms does not by itself show
that the context held no prediction, no pilot result and no Lancaster value.
The transcripts keep each call's reasoning
block but not its text, so whether that context influenced a judgement cannot
be checked directly. The transcripts themselves are not archived, because they
hold the session's e-mail address and local paths.

A new panel can be collected with any model, local or hosted, by sending the
prompt in `rater-prompt.md` once per rater per list and recording the replies in
the shape documented there. The prompt follows the Lancaster wording. Every
channel is rated from 0 (not at all) to 5 (greatly), a channel through which a
word is not experienced is a 0 and not a blank, and a word whose meaning the
rater does not know is marked as unknown. Open models run locally make the
workflow free of any external service (Hussain, Binz, Mata & Wulff, 2024,
*Behavior Research Methods*, https://doi.org/10.3758/s13428-024-02455-8).

## The pilot

`pilot/` keeps the earlier 60-word panel, which used SenseLex's previous wording
and an earlier model. It is not a result of the paper. `sample_words.mjs` keeps
its words as the overlap set, and `criterion.mjs` uses it only to measure how far
simulated norms move between model versions.

The pilot's files keep the format its own scripts wrote, which differs from the
files above. In `raters-pilot.json`, a rating may be a half point and a channel
left blank is missing from the rating. There is no `dont_know`, `list` or
`position`. The pilot's prompt allowed a blank for a channel that does not
apply, anchored the top of the scale at "very strongly" and labelled the head
effector "head" without excluding the mouth (`rater-prompt.md` lists these
differences). The `provenance` in `raters-pilot.json` names `rater-prompt.md` and
`words-sample.json`, which hold the 300-word panel's prompt and sample. The
pilot's prompt is the version of `rater-prompt.md` at commit 29bc895
(`git show 29bc895:validation/rater-prompt.md`), and its sample is
`pilot/words-sample-pilot.json`, which has no `band` or `set`.
In `results-pilot.json`, `reliability.perDimension` gives `splitHalf`, the
correlation between the means of the odd- and even-numbered raters, and
`spearmanBrown`, that correlation stepped up to twelve raters. Neither is
single-rater reliability, so neither can be compared with `results.json`. In
`llm-norms-eng-pilot.csv`, `n_records` and `n_perceptual_channels` are empty and
every `n_<channel>` is 0, because the pilot's script did not pass the counts to
the exporter. Each mean rests on up to twelve raters. The ratings in
`senselex-llm-validation-dataset-pilot.json` are identified as
`llmval-<rater>-<conceptId>` and stamped 2026-07-17, a fixed date that is not the
collection date (2026-08-28).
