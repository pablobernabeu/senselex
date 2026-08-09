# Computational validation and machine-assisted pilot norms

This folder holds the computational validation study of the SenseLex pipeline
and, in the same scripts, a reusable workflow for machine-assisted pilot norms.

## What it does

A panel of simulated raters (large-language-model instances given the
instrument's instructions and a persona, nothing else) completes the exact
sensorimotor rating task the app presents: the eleven Lancaster-protocol
dimensions, the 0-to-5 scale, one judgement per word per channel. Their
records then run through the production code path end to end: every record is
checked by the suite's validator, every norm is computed by the suite's norm
functions, and the outputs are written in the suite's own formats, including a
dataset file that imports directly into the browser edition.

The study serves two purposes. As validation, it exercises the whole pipeline
at realistic scale and tests whether norms computed from instrument-shaped
data behave as norms should: reliable across split halves, convergent with
published human concreteness ratings and structured the way human sensorimotor
norms are structured. As a capability, it gives researchers without funding
for a full rating panel a documented way to generate clearly labelled pilot
estimates, to check a candidate word list, size a design or prioritise where
human collection is most needed. Machine estimates are never a substitute for
human norms and must never be pooled with them; they are labelled
`source: "llm-validation"` in every record precisely so they cannot be
confused.

The approach follows the emerging evidence that large language models
reproduce human lexical-semantic judgements to a useful degree (Trott, 2024,
Behavior Research Methods; Dillion et al., 2023, Trends in Cognitive
Sciences), together with that literature's cautions: model output narrows the
variance of human panels, inherits training-data biases toward English and
high-resource languages, and stands in for no population. Treat the estimates
accordingly.

## Files

- `sample_words.mjs` draws the word sample from the app's curated bank,
  stratified across concreteness and spread across frequency. Writes
  `words-sample.json`.
- `raters.json` holds the panel's raw ratings (one entry per rater, with the
  persona and all judgements).
- `compute.mjs` validates every record, computes the norms and the statistics
  (split-half reliability with Spearman-Brown correction per dimension, mean
  pairwise inter-rater correlation, convergence with human concreteness,
  dominant-modality distribution, modality exclusivity), and writes
  `results.json`, `llm-norms-eng.csv` (the server's export format) and
  `senselex-llm-validation-dataset.json`, which imports into the browser
  edition through Import under Build & manage.

## Reproducing or adapting it

```
node validation/sample_words.mjs
# collect panel ratings into validation/raters.json (any LLM; see the paper)
node validation/compute.mjs
```

The rater prompt is reproduced in the paper and in the panel script; any
model, local or hosted, can fill `raters.json` provided each rater returns one
0-to-5 judgement per word per dimension. Open-source models run locally make
the workflow free of any external service (Hussain et al., 2024, Behavior
Research Methods).
