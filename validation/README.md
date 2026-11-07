# Validation

This folder holds the three validation studies reported in the paper. None
collects data from people. All three reuse the Lancaster Sensorimotor Norms
(Lynott et al., 2020, https://osf.io/7emr6/), which publish per-word means for
39,707 English words together with every individual rating behind them, so none
needed ethical review.

## The three studies

Study 1 is a reproduction study. `criterion.mjs` passes the published per-word
means through the suite's own norm functions and compares the output with the
published maximum perceptual strength, modality exclusivity and dominant
modality. `human_benchmark.mjs` starts from the 10.5 million individual
ratings. It groups them into the per-word vectors SenseLex itself would receive,
averages them with the suite's aggregation function and compares the result
with the published means. Where a word's published means disagree with its own
ratings, it checks whether they match another word's ratings instead.

Study 2 concerns the number of raters per word. `human_benchmark.mjs` also
estimates single-rater reliability for each channel over the whole lexicon, by
split halves of a fixed size stepped down with the Spearman–Brown formula. It
turns this estimate into the number of raters a new norming study needs for a
target reliability. The projection is checked directly against disjoint groups
of raters at several panel sizes.

Study 3 is an exploratory study of a simulated panel. Twelve simulated raters,
each a language model given a lay persona and the Lancaster instructions, rated
300 words in five lists of 60, each list a separate call. `PREDICTIONS.md` sets
out the hypotheses, sample and analysis, and 'Status of the plan' below explains
why the study does not count as preregistered. `compute.mjs` runs the panel
through the production validator and norm functions, and `criterion.mjs` tests
the hypotheses against the human norms, each on the 246 words of the
`confirmatory` set (words no simulated rater had rated before), as
`PREDICTIONS.md` specifies. H2 compares the two panels, simulated and human, on
the same words: the confirmatory words that both rated at least twelve times,
listed per channel in `human-benchmark-results.json`.

Machine ratings are never a substitute for human norms and must never be pooled
with them. Every rating in `senselex-llm-validation-dataset.json` is marked as
machine output by `source: "llm-validation"` and by a participant code from
`LLM01` to `LLM12` (the `rater` codes in `raters.json`).

## Reproducing the results

Everything runs on Node 22.13 or newer with no dependencies. The committed
results were produced with Node 24.12.0 (`../.node-version`).

The Lancaster files are not committed, because they carry their own citation
and terms. The trial-level file is 1.4 GB, so download both files once into a
folder outside any cloud-synchronised directory and point `SENSELEX_DATA_DIR`
at it:

```
export SENSELEX_DATA_DIR="$HOME/lancaster"   # any folder outside a synchronised directory
mkdir -p "$SENSELEX_DATA_DIR"
curl -fL -o "$SENSELEX_DATA_DIR/lancaster-sensorimotor-norms.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/5cc2d6441906ec0017056ba8"
curl -fL -o "$SENSELEX_DATA_DIR/lancaster-trial-ratings.csv" "https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/667d8a53f112ce02e78a6034"
```

Without `SENSELEX_DATA_DIR`, the scripts look in `validation/`, where Git ignores
these two files. Every script checks each file against the SHA-256 that OSF
publishes for it (`lancaster.mjs`) and stops on a mismatch. The commands above
use the OSF storage addresses because the short `https://osf.io/download/` links
have been seen to return an empty file.

From the repository root:

```
npm run verify     # rerun every step in a scratch copy and compare with the committed outputs
npm run validate   # rerun compute, human_benchmark and criterion in place
```

`npm run verify` writes nothing in the repository and exits non-zero if any
output differs from the committed file. Without the trial file, it skips
`human_benchmark.mjs` and says so. The flag `--require-trial`
(`node validation/verify.mjs --require-trial`) turns that into a failure. The
trial-level analysis takes a few minutes and up to 6 GB of memory.

Every random step (list order, split halves, bootstrap resamples) is seeded from
the one seed fixed in `PREDICTIONS.md` and set in `stats.mjs`, and the exported
records are stamped with the panel's collection date, so a rerun reproduces each
file byte for byte.

The workflow `.github/workflows/verify-trial.yaml` runs
`npm run verify -- --require-trial` on a GitHub-hosted Linux runner with the
Node release in `../.node-version`. It runs when the last commit of a push to a
branch other than main has '[verify trial]' in its message. Once the workflow is
on main, it can also be started on any branch with 'Run workflow' on the
repository's Actions tab.

The workflow stops before downloading anything if Node is not the release in
`../.node-version` or the runner has less than 7 GiB of memory available or less
than 5 GiB of disk free. It fetches both Lancaster files from the addresses
above into a folder outside the checkout and checks them against the checksums
in `lancaster.mjs` before the run. It keeps them in the Actions cache, under a
key made of those checksums, for later runs on the same branch. It commits
nothing and fails if any output differs from the committed file. The `ci`
workflow's own verify job runs on every push without the trial file. To
reproduce the results on your own machine, use the commands above.

## The steps and their files

| Step | Reads | Writes |
|:---|:---|:---|
| `sample_words.mjs` | the English bank in `../web-static/words.js`, the Lancaster norms, `pilot/words-sample-pilot.json` | `words-sample.json` |
| `make_lists.mjs` | `words-sample.json`, `personas.json` | `panel-lists.json` |
| collection (`run_panel.workflow.js`) | `panel-lists.json`, the prompt in `rater-prompt.md` | `raters.json` |
| `compute.mjs` | `raters.json`, `words-sample.json` | `results.json`, `llm-norms-eng.csv`, `senselex-llm-validation-dataset.json` |
| `human_benchmark.mjs` | both Lancaster files, `words-sample.json`, `raters.json` | `human-benchmark-results.json` |
| `criterion.mjs` | the Lancaster norms, `raters.json`, `words-sample.json`, `results.json`, `human-benchmark-results.json`, `pilot/raters-pilot.json`, `pilot/criterion-results-pilot.json` | `criterion-results.json`, `panel-vs-human.json` |

`stats.mjs` holds the statistics every script shares, including the single
implementation of reliability used for the panel and for people. `lancaster.mjs`
holds the file names, addresses, checksums and CSV reader.

`senselex-llm-validation-dataset.json` imports into the browser edition through
'Import dataset (JSON)' under 'Build & manage'. The browser edition averages
every rating of a language whatever its `source`, so import the file into a
browser that holds no human English ratings. Such a browser can be a fresh
browser profile or one cleared with 'Reset everything' after its data have been
exported. The browser edition's CSV exports do not carry `source`, although its
trial-level ratings CSV (`senselex-ratings-long-<code>.csv`) keeps the
participant codes `LLM01` to `LLM12`.

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

`panel-lists.json`: `seed` (the seed fixed in `PREDICTIONS.md`), `listSize`
(60) and `raters`, one per rater, each with its `rater` code, `persona` and
`lists`, five arrays of 60 words in the order the rater saw them. A rating's
`list` and `position` in `raters.json` index into these arrays from 1. The words
of the rater at index i of `personas.json`, counting from 0, were shuffled with
`seed` + i.

`raters.json`: `provenance` describes the collection (model, provider, run date
and sampling settings) and names the files that defined the prompt, personas,
lists and sample. Its `preregistration` entry, which `results.json` repeats,
names `PREDICTIONS.md`, calls the branch that holds it public and gives the
times recorded in the plan's commits. 'Status of the plan' below gives the times
GitHub received them and what is known of the repository's visibility. `raters`
holds one entry per rater, with its `rater` code, its `persona` and its
`ratings`. Each rating has the `word`, the `list` (1 to 5) and `position` (1 to
60) at which the rater saw it, `dont_know` (true if the rater did not know the
word, in which case no channel is rated), and one field per channel.

`llm-norms-eng.csv`, one row per word, in the format the Atlas exports:

| Column | Meaning |
|:---|:---|
| `concept_id`, `word` | identifier and word |
| `n_records` | raters who rated the word (those who knew it) |
| `mean_<channel>`, `n_<channel>` | mean rating on a channel and the raters behind it, empty where nobody rated the channel |
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
format, with format number `version` (5), which the import does not check. It
holds `languages` (English), `items` (one per sample word), `ratings` (one per
rater and known word) and an empty `responses`. Each item has its `language`, a
`conceptId` (the word upper-cased, with each run of characters other than
letters and digits replaced by `_` and any `_` at either end removed), `gloss`
and `word` (both the word), `concreteness` (a band: `high` from 3.5, `low` up to
2.5, otherwise `medium`), `concretenessValue` (the mean concreteness in
`words-sample.json`) and `frequency` (its Zipf value). Each rating has `id`
(`panel-<rater>-<conceptId>`), `language`, `conceptId`, `word`, `participant`
(the rater code), `dims` (the ratings by channel), `source` (`llm-validation`)
and `ts` (midnight UTC on the collection date, in milliseconds since 1970). The
file has no `skips` and leaves out the 43 judgements marked 'don't know', which
only `raters.json` records.

`results.json`, `human-benchmark-results.json` and `criterion-results.json` hold
the statistics reported in the paper. The reliability blocks in `results.json`
and `human-benchmark-results.json` come from `singleRaterReliability` in
`stats.mjs`. The function uses only the words with at least 2k ratings on the
channel, and `words` counts them. For each of these words, 2k of its ratings on
the channel are drawn at random and split into two halves of k (`halfSize`). The
half means are correlated across words, and `rk`, the mean of that correlation
over the random splits that gave one (`splits` of them), estimates the
reliability of a mean of k raters. `r1` is `rk` stepped down to a single rater
with the Spearman–Brown formula. Where `reliabilityOfPublishedMeans` and
`harmonicRaters` appear, the first is `r1` stepped up to the harmonic mean of
the words' rater counts on the channel, and the second is that harmonic mean.

`results.json`, from `compute.mjs`:

| Key | Meaning |
|:---|:---|
| `design` | `raters` and `words`, `recordsValidated` (the records, one per rater and known word, passed through the production validator), `wordsMarkedUnknown` (the judgements marked 'don't know', 43 of them on 16 distinct words), `blankChannels` (channels left blank in those records) and `provenance`, copied from `raters.json` |
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
| `exploratory` | `allWords`: agreement on all 300 words. `headChannel`: the head channel's agreement on all 300 words beside the pilot's head correlation on its 60 words. `modelStabilityOnOverlap`: pilot against panel means on the overlap words. `h2OnAllWords` and `h1bWithAllWordsReliabilities`: H2 and H1b as computed by the analysis script pushed with Amendment 1. `zerosAndLevels`: for each panel, how often each channel's mean is exactly 0 and the channel's mean level |

A bootstrap result gives the full-sample `estimate` and a 95% percentile interval
`ci` from 10,000 resamples seeded with the seed fixed in `PREDICTIONS.md`.
`resamples` is the number of resamples whose statistic was defined.

## The panel itself

`raters.json` is the panel's raw output. Its commit precedes those of the
panel's analyses, with the limits on such dating that 'Status of the plan' sets
out. Its `provenance` block records the model, the provider, the run date, that
each rater was an independent call, and that sampling parameters were left at
the provider default. `run_panel.workflow.js`, the script that collected it, is
kept so that the collection step can be inspected like the analysis. The
workflow runtime is not needed to reproduce the panel.

Each rater call ran as a subagent of an AI coding assistant (Claude Code).
Besides the prompt, it therefore received the assistant's subagent system
prompt, the request that had started the session, the assistant's memory index,
a list of its installed skills and the git status of the development repository
in which the session ran (see 'Status of the plan'). It also had the assistant's
standard tools, including file reading and shell commands, in a working
directory, this repository's files or, as the audit labels it, the folder
holding them. Earlier in the same session, the assistant had downloaded the
Lancaster trial-level ratings into the development repository's copy of
`validation/`. `PREDICTIONS.md` specified calls without tools, and the
provenance block in `raters.json`, which `compute.mjs` copies into
`results.json`, repeats that specification. The prompt told
each rater to use only the tool that returns its answers and not to read or
search anything.

`panel-transcript-audit.json`, written by `audit_panel_transcripts.mjs` from the
run's transcripts, records for each of the 60 calls how many tools it was
offered and which file and shell tools were among them, the tools it called and
the kinds of context it received. Each call made exactly one tool call, the one
that returned its ratings.

`audit_panel_transcripts.mjs` also matches nine study-related terms, each a
regular expression, against the context a call received besides the prompt, and
records which matched and where. Five matched in every call: `hypothesisLabel`,
`preregistration` and `lancaster` in the git status (the branch and recent
commit titles, which called the plan a preregistration and named H1b and the
Lancaster protocol), `hypothesis` in the descriptions of the installed skills
and `sensorimotor` in the memory index. `pilot`, `xuEtAl`, `spearman` and
`reliability` never matched. A search for these terms does not by itself show
that the context held no prediction, no pilot result and no Lancaster value. The
transcripts keep each call's reasoning block but not its text, so whether that
context influenced a judgement cannot be checked directly. The transcripts
themselves are not archived, because they hold the session's e-mail address and
local paths.

A new panel can be collected with any model, local or hosted, by sending the
prompt in `rater-prompt.md` once per rater per list and recording the replies in
the shape documented there. In the prompt, which follows the Lancaster wording,
every channel is rated from 0 (not at all) to 5 (greatly). A channel through
which a word is not experienced is a 0 and not a blank, and a word whose meaning
the rater does not know is marked as unknown. Open models run locally make the
workflow free of any external service (Hussain, Binz, Mata & Wulff, 2024,
*Behavior Research Methods*, https://doi.org/10.3758/s13428-024-02455-8).

## Status of the plan

Study 3 was not preregistered. `PREDICTIONS.md` and its Amendment 1 were
written, committed under the maintainer's name and pushed by an AI coding
assistant (Claude Code) during a session the maintainer had started, without the
maintainer's review, and neither was entered in a registry such as OSF or
AsPredicted. Both commits list the assistant as co-author, and the model that
`raters.json` records for the raters is the assistant's own model. The commits
here are copies of commits first made in the maintainer's private development
repository, which holds this repository's files in a subfolder and in which the
session ran. Version 0.2.0, the commit messages of that time and the provenance
blocks of `raters.json` and `results.json` call the plan a preregistration. The
names `prereg-panel-300`, `preregistered` (in `criterion-results.json`),
`preregistration` (in the provenance blocks) and `confirmatory` are kept as
identifiers only.

GitHub's push log for this repository
(https://github.com/pablobernabeu/senselex/activity) records the plan's commit,
668d017, on the `prereg-panel-300` branch at 23:29 UTC on 22 September 2026, and
the amendment, ab874da, at 23:41 UTC. The branch has not been rewritten since.
The push log does not record whether the repository was public at those times.
It probably was, since its v0.0.1 release, published at 22:08 UTC that day, was
archived by Zenodo's GitHub integration
(https://doi.org/10.5281/zenodo.22905874), which works only with public
repositories.

Within the repository, only the assistant's own records date the collection.
The commit that added `raters.json` gives 00:01 UTC on 23 September as its
author date, but this repository's copy of it was made on 9 October, and the
push log records the ratings reaching this repository at 02:03 UTC that day.
The run date in the provenance block gives no time. The same commit replaced the
line of `run_panel.workflow.js` that was to record when the run ended with a
comment that the workflow runtime forbids reading the clock. According to the
provenance block, that line made the run fail after all 60 calls had returned,
and the ratings were recovered by replaying the cached calls, which makes no new
model request. Outside the repository, the session log that the Claude Code
service keeps in the maintainer's account, which is not public, records the
start of the collection run at 23:46 UTC on 22 September, after both pushes.

Besides the deviations described under 'The panel itself', four limitations
apply. First, the plan does not report how closely the pilot's simulated raters
agreed with one another. The correlation between the means of their two halves
of six raters was .98 to .99 on every channel (`splitHalf` in
`pilot/results-pilot.json`), which the Spearman–Brown formula steps down to a
single-rater reliability of .88 to .97. Human single-rater reliabilities on the
H2 words are .08 to .40, and Amendment 1 already reports human values as low as
.08, so H2's prediction was close to certain, although the pilot used an earlier
model and wording. Second, Amendment 1 states that it was informed by the human
trial-level ratings, including human reliabilities on the same 300 words, and by
no machine rating. The pilot's machine ratings, which cover 54 of these words
and agreed least with the human norms on the head and torso channels (.45
each), were available when it was written. Third, H2 and the H1b reliabilities
use the confirmatory words, as the plan's text says. The analysis script pushed
with Amendment 1 instead used, for each panel, every one of the 300 words that
the panel had rated at least twelve times. Following the text was decided after
the data were collected. `criterion.mjs` reports the script's computation as
exploratory, and both reach the same verdicts. Finally, the assistant that wrote
the plan also ran the raters as its own subagents and wrote the provenance
records, so nothing public shows that the reported run was the only one.

## The pilot

`pilot/` keeps the earlier 60-word panel, which used SenseLex's previous wording
and an earlier model. It is not a result of the paper. `sample_words.mjs` keeps
as the overlap set the 54 pilot words that pass its filters (the other six have
a Zipf frequency of zero). `criterion.mjs` uses the pilot only in exploratory
results, to measure how much simulated norms change between model versions and
to report the pilot's head correlation beside the panel's.

The pilot's files keep the format its own scripts wrote, which differs from the
files above. In `raters-pilot.json`, a rating may be a half point and a channel
left blank is missing from the rating. There is no `dont_know`, `list` or
`position`. The pilot's prompt allowed a blank for a channel that does not
apply, anchored the top of the scale at 'very strongly' and labelled the head
effector 'head' without excluding the mouth (`rater-prompt.md` lists these
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
