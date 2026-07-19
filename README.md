# SenseLex

Open infrastructure for collecting, sharing, and reusing crosslinguistic multisensory lexical norms. SenseLex is the software deliverable of the SenseLex research programme, and it is built to be useful to the wider language-science community in its own right.

The suite has three parts that share one core.

The Atlas is a web service and database. It accepts sensorimotor ratings and free-naming responses, computes norms from them, and serves and exports those norms under an open licence.

The field client is an offline-first layer for data collection where there is little or no connectivity. It records to a local queue and synchronises to the Atlas when a connection returns, and it is designed to be packaged as a desktop application for fieldwork.

The shared core holds the science: the rating dimensions, the norm computations, and the validation rules, written as pure functions so that the same logic runs on the server, in the field client, and in batch re-analysis.

Alongside these, the `web-static/` folder holds a browser edition: a single self-contained page that runs the same study building, rating, and norm computation in the browser alone, with no server and no account, saving data to the device. It suits quick use, demonstration, and low-connectivity settings, and it doubles as a recruitable study runner through URL study links (Prolific parameters, completion codes, and optional submission to a hosted Atlas). See `web-static/README.md`.

The `integrations/` folder holds the bridges to the wider ecosystem, currently a jsPsych plugin implementing the sensorimotor rating trial and documentation of the two-way jsPsych workflow (export a study, import its data).

## Why it is built this way

The prototype depends on nothing beyond Node itself. It uses the built-in HTTP server, the built-in SQLite driver, the built-in crypto, and the built-in test runner. A zero-dependency build has no supply chain to compromise, installs nothing, and runs anywhere a recent Node runs, which suits both review and fieldwork. The architecture is written so that a scaled deployment can swap SQLite for PostgreSQL and add a web framework or a shared rate-limit store without touching the science or the routes, because those concerns are isolated behind the repository and the middleware.

See `ARCHITECTURE.md` for the design and `SECURITY.md` for the security model.

## Requirements

Node 22.5 or newer, for the built-in SQLite driver. The prototype was developed and tested on Node 24.

## Running it

```
cd software
node bin/senselex.js seed     # load a small illustrative dataset
node bin/senselex.js serve    # start the Atlas on http://127.0.0.1:8787
```

Open the address in a browser to use the Atlas front end. Set `SENSELEX_API_TOKENS` before any real use, otherwise write endpoints are open and the server says so on start-up.

## Testing

```
cd software
npm test
```

The suite covers the norm mathematics against known values, the HTTP API including authentication, validation, pagination, idempotent sync, rate limiting, and CSV export, and the offline client including a retried sync that must not double-count.

## Configuration

All configuration comes from the environment, so no secret is committed. See `.env.example` for the full list. The settings that matter most are `SENSELEX_API_TOKENS` (the bearer tokens allowed to write), `SENSELEX_CORS_ORIGINS` (the browser origins allowed to call the API), and `SENSELEX_DATABASE_PATH`.

## The data model in brief

A language carries a code, a script, an orthographic depth, and a text direction. A concept carries a stable identifier linkable to the Concepticon catalogue. A rating is one participant's strength vector for one word across the eleven sensorimotor dimensions. A response is one free-naming answer, coded for type and length so codability can be computed. Participants are pseudonymous, and no identifying information is stored.

## Licence

MIT for the code. Norms exported by the Atlas carry a Creative Commons Attribution licence in their metadata sidecar.
