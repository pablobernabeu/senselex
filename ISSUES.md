# Open issues

Findings from the code-health audit of September 2026 that were not resolved in
that pass, each with its severity and the reason it was deferred. Resolved
findings are in `CHANGELOG.md`.

## Major

The word banks cannot yet be rebuilt with the package versions used to build
them. `data/build_wordbanks.py` wrote `web-static/words.js` in July 2026 without
recording its package versions. `data/requirements.txt` now pins the versions
installed on 23 September 2026, but only the direct dependencies, and nothing
shows they match the July build. The validation does not depend on a rebuild,
because it reads the committed `words.js`. Deferred: rebuild the banks with the
pinned versions, compare with the committed file and add a lock that also
covers the dependencies' own dependencies.

## Minor

The Atlas does not store words recorded as unknown or the release with which a
rating was made. The browser edition keeps both on the device, and a study link
with an Atlas address submits only ratings. Deferred: add both to the Atlas
schema and the sync format.

No JavaScript linter or formatter is configured. The project has a
zero-dependency rule, and ESLint or Prettier would add development dependencies.
The code follows one style by hand, and every script except
`validation/run_panel.workflow.js` passes `node --check`. That file is an
archived workflow body with a top-level `return`, which only its runtime
accepts. Deferred: whether to accept a pinned development dependency for linting
is the maintainer's decision.

Three pilot outputs are read by no current step.
`validation/pilot/results-pilot.json`, `llm-norms-eng-pilot.csv` and
`senselex-llm-validation-dataset-pilot.json` were written by the pilot's version
of `compute.mjs`. They are kept as the pilot's record next to the files that are
still read (`raters-pilot.json`, `words-sample-pilot.json`,
`criterion-results-pilot.json`), and `validation/README.md` says the pilot is
not a result of the paper. Deferred: remove them if the pilot's record is not
wanted in the next release.

The Docker base-image digest will go out of date. Pinning it for
reproducibility also pins the operating-system packages in the image. Deferred:
re-resolve `node:24-alpine` and update the digest in `Dockerfile` when a
security release of Node or Alpine appears.

The trial-level analysis holds the whole file in memory.
`validation/human_benchmark.mjs` needs about 6 GB of heap
(`--max-old-space-size=6144`) because it keeps every rating vector for the
cross-word match. Deferred: a two-pass design could lower that, but the current
one is verified and runs in a few minutes on an ordinary laptop.
