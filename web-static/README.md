# SenseLex Atlas, browser edition

This folder holds a self-contained web page, `index.html`, that is a working tool for building, collecting, and analysing multisensory lexical norms. It needs no installation, no build step, no server-side code, and no account or login. Everything runs in the browser, and the data you collect is saved on your own device. It loads a companion file, `words.js`, which carries word banks for 14 languages, with frequency for every word and, for English, concreteness.

## What you can do with it

You can draw a study set from a word bank under controlled conditions, choosing a language, how many words you want, and the frequency range, and for English the concreteness range as well, so a list is a sample you have designed. You can then run a sensorimotor rating session, presenting each word and recording its strength on the eleven perceptual and action channels of the Lancaster protocol, or a free-naming session that records the name a participant gives for each item. "Next" moves on without recording anything. "Don't know this word" (or, for naming, "No name given") records the item as unknown: it counts towards finishing the session but never enters the norms, and answering it later replaces the record. A session made of nothing but unknown items does not finish. Every record this page saves carries the SenseLex release that saved it. Items recorded as unknown stay on the device: a study link with an Atlas address submits only ratings, and the Atlas keeps neither the unknown items nor the release. The prompt can be read aloud through the browser's speech synthesis, which helps with participants who do not read, including children and people with reading difficulty. As data accumulate, the Explore tab computes the norms live: the dominant modality, the maximum perceptual strength, the modality-exclusivity score, the between-rater dispersion (a measure of spread, which runs opposite to a reliability coefficient), and the codability of any naming responses. You can sort, filter by concreteness or frequency, and download the norms as CSV, alongside a trial-level long-format CSV (one row per participant, word and dimension) for archiving and reanalysis.

You manage everything under the Build and manage tab. The word list is editable by hand or by pasting a list, you can add languages with their script and direction, and the whole dataset exports to JSON for backup or transfer and imports back with a merge that does not duplicate records.

## Export formats

Export dataset (JSON), under Build and manage, writes `senselex-dataset-<date>.json`, one object with `version` (5), `exportedWith` (the SenseLex release that exported it), `languages`, `items`, `ratings`, `responses` and `skips`. A language has `code`, `name`, `script`, `direction` (`ltr` or `rtl`) and `family`. An item has `language`, `conceptId`, `gloss` and `word`, and its band (`high`, `medium` or `low`) is in `concreteness`, which is empty or absent when the item has none. An item drawn from a bank also has `frequency` (Zipf), and an English bank item has `concretenessValue`, its mean concreteness rating from 1 to 5. A rating has `id`, `language`, `conceptId`, `word`, `participant`, `dims` (a value from 0 to 5 for each rated channel), `source` (`browser` or `sample` for a record made on this page, and for an imported record the value it came with, such as `jspsych` or `llm-validation`), `ts` (milliseconds since 1970) and `appVersion`. A naming response has `id`, `language`, `conceptId`, `cue`, `name`, `length` (the number of words in the name), `participant`, `source`, `ts` and `appVersion`. An item recorded as unknown, in `skips`, has `id`, `task` (`rating` or `naming`), `language`, `conceptId`, `participant`, `source`, `ts` and `appVersion`, and `word` when the task is rating. A record made through a link that carries Prolific's `STUDY_ID` and `SESSION_ID` also has `study` and `session`. A rating not yet accepted by the Atlas named in a study link has `pending`, and one in a batch the Atlas refused as invalid also has `rejected` (a refused token or a server error leaves only `pending`).

Import dataset (JSON) needs a `languages` array. It merges languages by code, items by language, concept and word, and ratings, responses and skips by `id`, so a record already present is kept as it is. It then drops any skip that an answer from the same participant to the same item replaces.

Under Explore, Download norms (CSV) writes `senselex-sensorimotor-<code>.csv` for the language chosen there, with one row per rated word and the columns `concept_id`, `word`, `concreteness`, `zipf_frequency`, `n_records`, `mean_<channel>` and `n_<channel>` for each of the eleven channels, `dominant_modality`, `max_perceptual_strength`, `modality_exclusivity` and `n_perceptual_channels`. These are the Atlas export's columns with `concreteness` and `zipf_frequency` added. `concreteness` holds the bank's mean concreteness rating for an English bank word and otherwise the item's band, if it has one. Means, the maximum strength and exclusivity are rounded to three decimals. Download trial-level ratings (CSV) writes `senselex-ratings-long-<code>.csv` with one row for each rated channel of each rating in that language, in the columns `participant`, `language`, `concept_id`, `word`, `dimension`, `rating`, `study`, `session`, `timestamp` (ISO 8601) and `app_version`.

## The word banks

`words.js` holds one word bank per language. Every bank carries a Zipf word-frequency value for each word, so the study builder can sample across the frequency range, and the English bank additionally carries a mean concreteness rating, so for English the builder can also constrain concreteness. The banks are a derived feature subset of published resources, and they give the languages roughly equal coverage.

Word frequency, for every language, comes from the wordfreq package (Speer, 2022), https://doi.org/10.5281/zenodo.7199437, which provides Zipf frequencies built from a blend of corpora. Mean concreteness, for English only, comes from Brysbaert, Warriner and Kuperman (2014), Behavior Research Methods 46(3), 904 to 911, https://doi.org/10.3758/s13428-013-0403-5. Concreteness ratings of this kind are not available in a comparable form for the other languages, which is part of what the tool exists to address. The banks are not covered by the MIT licence of the code: their frequencies derive from wordfreq data, shared under a Creative Commons Attribution-ShareAlike 4.0 licence, and their English concreteness values are Brysbaert, Warriner and Kuperman's (2014), offered freely for research. `words.js` keeps those terms, and anyone using the words should cite both sources.

A few languages that the frequency corpus does not cover, such as Swahili, Yoruba, Basque and Thai in the current build, keep only a small set of hand-checked core words. Arabic, Hebrew, Tamil, Vietnamese, Turkish and Japanese keep the same hand-checked core words for a different reason: wordfreq does cover them, but a repeated, multi-round adversarial audit found their derived banks kept a large share of proper nouns, foreign intrusions, bound morphemes or unresolved inflected forms even after every filter in the pipeline ran, including a per-language NLP pass. Measured junk rates ran from about 14% (Japanese) to about 60% (Arabic), well above the roughly 2 to 12% seen for every other curated language, so these six keep the small hand-checked list until a cleaner bank can be built. See `../data/README.md` for the detail and the exact figures.

`words.js` is generated by `../data/build_wordbanks.py`, which also curates each bank down to content words. See `../data/README.md` for the full pipeline and its dependencies. The raw source files are not committed.

## Study links and recruitment platforms

A study link preconfigures a session through URL parameters, so a recruitment
platform can send participants straight into a task with nothing to set up on
screen:

- `?lang=spa&task=rating` preselects the language and the task. `lang` is a
  language code from the page's list, shown in brackets after each name in the
  Language menu, and `task` is `rating` or `naming`. Other values are ignored,
  and the participant can still change both.
- `&cc=CODE` holds a Prolific completion code. When every item is complete, the
  page shows a Return to Prolific link that registers the submission.
- `&atlas=https://your-atlas.example&token=TOKEN` submits ratings to a hosted
  Atlas as they are saved. Submission is idempotent (each record's id is the
  client id, so a retried upload cannot double-count), it retries on failure and
  when the connection returns, and the page states on screen that submission is
  happening and to where. Naming responses stay local, because the Atlas stores
  coded responses and coding is an analyst's judgement. A rating edited after
  successful submission stays local. On such a link, a session finishes only
  once the participant has saved at least one rating in that language, whichever
  task is selected.

Before you share a link with an `atlas` address, prepare that Atlas. Add the
origin the page is served from (for example `https://study.example.org`) to its
`SENSELEX_CORS_ORIGINS`. That list is empty by default, and the browser blocks
every submission from an origin that is not on it. A page opened from a file has
the origin `null`, so host the page rather than sending participants the file.
If the Atlas has write tokens (`SENSELEX_API_TOKENS`), `token` must be one of
them. Create the study's language and the concept id of every item participants
will see, with `POST /v1/languages` and `POST /v1/concepts` (see `../README.md`),
because the Atlas refuses a whole batch if any rating in it names a language or
concept it does not hold. A participant's browser holds the page's starter set,
not a list you have edited, so read the ids from the Concept column under Build &
manage in a browser that has not opened the page before. Ratings the
Atlas does not accept stay on the participant's device, and the page reports
them as refused or as still awaiting submission.

Prolific's own `PROLIFIC_PID`, `STUDY_ID` and `SESSION_ID` parameters are read
automatically: the participant code locks to the Prolific id (when it consists
of up to 128 letters, digits and `_.:-`, as Prolific ids do) and all three are
stored with each record. The same mechanics serve any panel that can append URL
parameters to a study address.

## Run the study elsewhere (jsPsych)

Under Build & manage, "Run the study elsewhere" exports the items of one
language as a ready-to-run jsPsych 8 experiment: a single HTML file that
presents the same rating instrument, reads the Prolific participant id
(`PROLIFIC_PID`) and the `cc` completion code at run time, and ends by offering
the participant one download of their data, either a SenseLex dataset file that
imports straight back here or a jsPsych CSV, saved on the participant's own
device. The file sends nothing anywhere, so on a plain static host, the data
reach you only if participants pass the file on. A standalone jsPsych
plugin for embedding the trial in your own timelines lives in
`../integrations/jspsych/`.

## Viewing and hosting it

Open `index.html` in any modern browser. `words.js` loads alongside it, so keep the two files together. To serve it over a local address instead, run a static server from this folder, for example `python -m http.server 4173`, then open `http://localhost:4173/`. Because these are static files, any static host will serve them with no configuration. The quickest route is a drag-and-drop deploy onto Netlify Drop or Cloudflare Pages, which returns a public URL in under a minute, or, if the project is pushed to GitHub, GitHub Pages will serve the folder directly.

## What the data never does

The data you collect stays in this browser's local storage on this device, with
one exception you control: a study link that names an Atlas address submits
ratings there as they are saved, and the page says so on screen. There is
otherwise no upload, no account, and no tracking. Export the data to move it
elsewhere.

## Relation to the full Atlas

The full Atlas, at the repository root, adds what a single page cannot: shared online collection by many contributors with authentication, the offline-first field client with idempotent synchronisation, a server database, and the FAIR export endpoints. The browser edition and the full service share the same norm mathematics, although the service has no import yet for a dataset exported here.
