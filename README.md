# SenseLex

Open infrastructure for collecting, sharing, and reusing crosslinguistic multisensory lexical norms. SenseLex is the software deliverable of the SenseLex research programme, and it is built to be useful to the wider language-science community in its own right.

The suite has three parts that share one core.

The Atlas is a web service and database. It accepts sensorimotor ratings and free-naming responses, computes norms from them, and serves and exports those norms under an open licence.

The field client is an offline-first layer for data collection where there is little or no connectivity. It validates each record locally, keeps it in a queue and, whenever the host application calls `sync()`, sends the queue to the Atlas in idempotent batches. It is a module, `src/offline/client.js`, and the only store it comes with keeps the queue in memory, so queued records do not survive a restart. The suite does not include a persistent store or a packaged desktop application, and `desktop/README.md` sketches the desktop build.

The shared core holds the science: the rating dimensions, the norm computations, and the validation rules, written as pure functions so that the same logic runs on the server, in the field client, and in batch re-analysis.

Alongside these, the `web-static/` folder holds a browser edition: a single self-contained page that runs the same study building, rating, and norm computation in the browser alone, with no server and no account, saving data to the device. It suits quick use, demonstration, and low-connectivity settings, and it doubles as a recruitable study runner through URL study links (Prolific parameters, completion codes, and optional submission to a hosted Atlas). See `web-static/README.md`.

The `integrations/` folder holds the bridges to the wider ecosystem, currently a jsPsych plugin implementing the sensorimotor rating trial and documentation of the two-way jsPsych workflow (export a study, import its data).

## Why it is built this way

The prototype depends on nothing beyond Node itself. It uses the built-in HTTP server, the built-in SQLite driver, the built-in crypto, and the built-in test runner. A zero-dependency build has no supply chain to compromise, installs nothing, and runs anywhere a recent Node runs, which suits both review and fieldwork. The architecture is written so that a scaled deployment can swap SQLite for PostgreSQL or add a shared rate-limit store without touching the science, because those concerns are isolated behind the data layer and the middleware.

See `ARCHITECTURE.md` for the design and `SECURITY.md` for the security model.

## Requirements

Node 22.13 or newer, the first 22.x release that provides the built-in SQLite driver without the `--experimental-sqlite` flag. The prototype was developed and tested on Node 24, and the committed validation results were produced with Node 24.12.0, recorded in `.node-version`.

## Running it

```
node bin/senselex.js seed     # load a small illustrative dataset (demonstration only)
node bin/senselex.js serve    # start the Atlas on http://127.0.0.1:8787 (the default command)
```

`seed` writes six languages and five concepts into the database at `SENSELEX_DATABASE_PATH`, replacing any entry with the same code or identifier. It also writes 11 invented rating vectors and 12 naming responses, which enter the norms and exports like real data, so use it only on a demonstration database. `npm run seed` and `npm start` run the same two commands.

Open the address in a browser to use the Atlas front end. Set `SENSELEX_API_TOKENS` before any real use, otherwise write endpoints are open and the server says so on start-up.

`npm run smoke` is a quick check that an installation works. It starts a throwaway Atlas on an in-memory database, so nothing is written to disk. It then loads the seed data and queries the health, norms and CSV export routes, printing a summary that ends in `smoke ok`.

## Testing

```
npm test
```

The suite covers the norm mathematics against known values, the HTTP API including authentication, validation, idempotent sync, rate limiting and CSV export, and the offline client including a retried sync that must not double-count and a queue larger than one batch that must not deadlock. `test/stats.test.js` checks the statistics behind the validation studies against hand-worked values, and `test/integrations.test.js` checks that the jsPsych plugin's default dimensions match the domain core, that its save and don't-know buttons end a trial as `integrations/jspsych/README.md` describes and that a mapped trial passes the Atlas validator.

The suite also checks the browser edition against the domain core. That edition runs from a file with no build step, so it cannot import the core and carries a copy instead. `test/browser-core.test.js` extracts the copy from between the markers in `web-static/index.html`, evaluates it, and asserts that its norm functions agree with their counterparts in `src/domain/norms.js` over a fixture set covering partial vectors, all-zero vectors and single raters. The core keeps its name tally private, so the test checks the copy's tally over case-variant names against the core's rule (trim, then lower-case) restated in the test. The copy and that restatement drop a naming response that is empty after trimming, which the core counts.

## Validation

The `validation/` folder holds the three studies reported in the paper that describes and validates SenseLex, which is in preparation; until it is published, cite the software through `CITATION.cff`. They reproduce the Lancaster Sensorimotor Norms from their individual ratings, estimate how many raters a norming study needs on each channel, and test a panel of simulated raters against a preregistered plan. `npm run verify` reruns them in a scratch copy and checks that every output reproduces the committed file, without writing anything in the repository. Without the 1.4 GB trial-level file, it skips `human_benchmark.mjs`, the one step that needs it, and says so in its report. `criterion.mjs`, the step after it, then reads the committed `human-benchmark-results.json`. The Lancaster files are fetched separately: `validation/README.md` gives the addresses and the order of the steps, and `validation/lancaster.mjs` holds the published checksums, which every script that reads a Lancaster file checks first.

## HTTP API

Every route answers JSON unless stated otherwise. An error is `{"error": message}`, with a `detail` field when there is more to say. Reads are public. A write is a POST with a JSON body, and when `SENSELEX_API_TOKENS` is set it must carry `Authorization: Bearer <token>`. Every request except a CORS preflight (`OPTIONS`, answered `204`) counts towards the rate limit of `SENSELEX_RATE_MAX` requests per `SENSELEX_RATE_WINDOW_MS` for each client address (240 a minute by default), and a client over the limit gets `429` with `detail.retryAfter` in seconds.

| Route | What it does |
|:---|:---|
| `GET /` | the Atlas front end (HTML, with `/app.js` and `/styles.css`) |
| `GET /health` | `{status: "ok", summary}`, with counts of languages, concepts, ratings and responses |
| `GET /v1/languages`, `GET /v1/concepts` | one page of reference data, `{rows, total, limit, offset}`, with the database's column names (`orthographic_depth`, `concepticon_id`, `created_at` and so on) |
| `GET /v1/languages/{code}` | one language, or `404` |
| `POST /v1/languages` | creates or replaces a language from `code`, `name`, `script` and, optionally, `direction` (`ltr`, the default, or `rtl`), `orthographicDepth` (`shallow`, `intermediate`, `deep` or `non_alphabetic`) and `concepticonOk` (true unless sent as `false`), and returns `{ok, code}` |
| `POST /v1/concepts` | creates or replaces a concept from `id`, `gloss` and, optionally, `concepticonId` (a Concepticon concept-set number), and returns `{ok, id}` |
| `POST /v1/ratings` | stores one rating from `clientId`, `languageCode`, `conceptId`, `word`, `ratings` and, optionally, `participantRef`, and returns `{ok, stored}`. `ratings` gives a number from 0 to 5 for at least one of `touch`, `hearing`, `smell`, `taste`, `vision`, `interoception`, `mouth_throat`, `hand_arm`, `foot_leg`, `head` and `torso`, and any other key is refused |
| `POST /v1/responses` | stores one naming response from `clientId`, `languageCode`, `conceptId`, `name`, `responseType` (`abstract`, `source_based` or `evaluative`) and, optionally, `length` (an integer from 0 to 100, by default the number of words in `name`) and `participantRef`, and returns `{ok, stored}` |
| `POST /v1/sync` | takes `{records: [...]}`, at most 1000 ratings and responses, each with a `kind` (`rating` or `response`) beside its fields, and returns `{ok, received, inserted, duplicates}`. One invalid record refuses the whole batch, and a valid batch is committed in one transaction |
| `GET /v1/norms/sensorimotor?language=` | one page of per-word norms, each with `conceptId`, `word`, `nRecords`, `mean` and `n` keyed by dimension, `dominantModality`, `maximumPerceptualStrength`, `modalityExclusivity` and `perceptualChannels` |
| `GET /v1/norms/codability?language=` | one page of per-concept codability, each with `conceptId`, `n`, `diversity`, `agreement`, `meanUtteranceLength`, `meanUtteranceCharacters`, `distinctNames` and `responseTypeProportions` |
| `GET /v1/export/sensorimotor.csv?language=` | every norm of the language as CSV, in the columns `concept_id`, `word`, `n_records`, `mean_<dimension>` and `n_<dimension>` for each dimension, `dominant_modality`, `max_perceptual_strength`, `modality_exclusivity` and `n_perceptual_channels`, with the row count in the `X-Total-Rows` header |
| `GET /v1/export/metadata.json?language=` | the export's metadata: licence, language, row counts and a description of every column |

The norm and export routes require `language` and answer `400` without it, and the export routes also answer `400` when it is not a valid identifier. An unknown language, or one with no data, gives an empty page of norms. The list and norm routes take `limit` (default 50, at most `SENSELEX_MAX_PAGE_SIZE`, which defaults to 200) and `offset` (default 0). A measurement's `clientId` is its primary key, so resending it returns `stored: false`, or counts as a duplicate in a sync, and nothing is stored twice. A participant named by `participantRef` is created on first use. A write is refused with `401` when tokens are configured and the request carries no valid one, with `413` above `SENSELEX_MAX_BODY_BYTES` and with `400` for malformed JSON. It is refused with `422` when validation fails (`detail` lists the reasons) or when the measurement names a language or concept that has not been created (`Unknown language or concept`). A measurement whose `participantRef` names a new participant and whose language has not been created gets `500` instead, and so does a sync that contains one. An unknown route answers `404`, and an unexpected failure `500`. Identifiers (`clientId`, `code`, `id`, `languageCode`, `conceptId`, `participantRef`) are 1 to 128 characters, each a letter or digit in any script or one of `_`, `.`, `:` and `-`.

## Configuration

All configuration comes from the environment, so no secret is committed. See `.env.example` for the full list. The settings that matter most are `SENSELEX_API_TOKENS` (the bearer tokens allowed to write), `SENSELEX_CORS_ORIGINS` (the browser origins allowed to call the API), and `SENSELEX_DATABASE_PATH`.

## The data model in brief

A language carries a code, a script, an orthographic depth and a text direction. A concept carries a stable local identifier and an optional Concepticon concept-set number, which the researcher supplies; nothing resolves it against the catalogue automatically, so an export is linkable only as far as that field has been filled in. A rating is one participant's strength vector for one word across the eleven sensorimotor dimensions, and the vector may be partial. A response is one free-naming answer, coded for type and length so codability can be computed. Participants are pseudonymous and no identifying information is stored.

Partial vectors are the reason norms carry a per-dimension count as well as a record count. A channel nobody rated averages to an empty value, because zero is a substantive judgement in this protocol, meaning the referent is not experienced through that channel at all. Reading an absent judgement as a zero one would inflate modality exclusivity, which is a range over a sum. Exports therefore carry `mean_<dimension>` beside `n_<dimension>`, an empty cell where no one judged a channel, and `n_perceptual_channels` beside the exclusivity score, since exclusivity depends on how many channels contributed and values computed over different numbers of channels are not comparable. Means, `max_perceptual_strength` and `modality_exclusivity` are rounded to three decimal places. A cell that would begin with `=`, `+`, `-`, `@`, a tab or a carriage return, such as the word form `-ness`, is written with a leading apostrophe so that spreadsheets do not run it as a formula. The apostrophe stays in the file, so a CSV reader such as R or pandas keeps it as part of the value.

## Licence

MIT for the code; the full text is in `LICENSE`.

The data are licensed separately from the code. Norms exported by the Atlas carry
a Creative Commons Attribution 4.0 licence in their metadata file. The files the
browser edition exports carry no licence of their own, so state one when you share
them.

Word-bank sources keep their own terms, so `web-static/words.js` is not covered
by the MIT licence. Its Zipf frequencies are derived from wordfreq data (Speer,
2022, https://doi.org/10.5281/zenodo.7199437), which wordfreq distributes under a
Creative Commons Attribution-ShareAlike 4.0 licence, and the file is shared under
that licence. English concreteness values come from Brysbaert, Warriner and
Kuperman (2014, https://doi.org/10.3758/s13428-013-0403-5), offered freely for
research and redistributed here with attribution under their original terms. Cite
both if you use the word banks.
