# Validation

This folder holds the two validation studies reported in the paper, and, in the
same scripts, a reusable workflow for machine-assisted pilot norms.

Neither study collects data from people. Both reuse published, openly available
aggregated norms, so neither needed ethical review.

## 1. Reproduction against the published human norms

`criterion.mjs` is the study that can fail. The Lancaster Sensorimotor Norms
publish, for 39,707 English words, both the per-dimension means and the
quantities derived from them: maximum perceptual strength, modality exclusivity
and dominant perceptual modality. Pushing the published means through this
suite's own norm functions and comparing the output with the published derived
columns tests the software against an external ground truth, over the whole
lexicon instead of a sample.

The result: maximum perceptual strength and modality exclusivity agree for every
one of the 39,707 words, exclusivity to within 8e-10, which is floating-point
noise. Dominant modality agrees for 39,404. All 303 differences are words where
two channels tie in the published means, so the two implementations differ over
how to break a tie, not over which channel is strongest. The suite resolves ties
to the earlier channel in its canonical order, which is now documented rather
than implicit.

The same script then compares the simulated panel's norms with the human norms
for the same sixty words, per channel and on the derived measures.

## 2. The simulated-rater panel

A panel of simulated raters (large-language-model instances given the
instrument's instructions and a persona, nothing else) completes the exact
sensorimotor rating task the app presents: the eleven Lancaster-protocol
dimensions, the 0-to-5 scale, one judgement per word per channel. Their records
run through the production code path end to end, checked by the suite's
validator, computed by the suite's norm functions, and written in the suite's own
formats including a dataset file that imports into the browser edition.

Each rater is a separate call with no shared context and no tools. That matters.
An earlier version of this panel was generated in one pass and its raters agreed
at a mean pairwise correlation of .97, which is far above any human panel.
Running each rater in isolation moved that only to .96, which is the honest
headline about simulated raters and is reported as a limitation, not a result.

Machine estimates are never a substitute for human norms and must never be pooled
with them. They are labelled `source: "llm-validation"` in every record so they
cannot be confused.

The approach follows the evidence that language models reproduce human
lexical-semantic judgements to a useful degree (Trott, 2024, *Behavior Research
Methods*), together with that literature's cautions: model output narrows the
variance of human panels, inherits training-data biases towards English and
high-resource languages, and stands in for no population (Dillion et al., 2023,
*Trends in Cognitive Sciences*).

## Files

- `rater-prompt.md` is the verbatim system and user prompt, with the persona slot
  and a filled example.
- `personas.json` holds the twelve personas. All are UK-resident, which is a
  stated limitation of the panel.
- `sample_words.mjs` draws the word sample from the app's curated bank,
  stratified across concreteness and spread across frequency. Writes
  `words-sample.json`.
- `raters.json` holds the panel's raw ratings, with a `provenance` block giving
  the model, the provider, the run date and the fact that each rater was an
  independent call. Sampling parameters were left at the provider default and are
  recorded as such.
- `compute.mjs` validates every record, computes the norms and the panel
  statistics, and writes `results.json`, `llm-norms-eng.csv` and
  `senselex-llm-validation-dataset.json`, which imports into the browser edition
  through Import under Build and manage.
- `criterion.mjs` runs both comparisons against the Lancaster release and writes
  `criterion-results.json`.

## Reproducing it

```
node validation/sample_words.mjs
node validation/compute.mjs
curl -sS -L -o validation/lancaster-sensorimotor-norms.csv "https://osf.io/download/48wsc/"
node validation/criterion.mjs
```

The Lancaster file is about 17 MB and is not committed, because it carries its own
citation and terms. `criterion.mjs` prints the fetch command if it is absent.

`compute.mjs` stamps a fixed timestamp rather than the wall clock, so the
artefacts reproduce byte for byte and a reader can verify them. Override it with
`SENSELEX_VALIDATION_TIMESTAMP` when generating a genuinely new panel.

Regenerating the panel itself means re-running the twelve raters against
`rater-prompt.md` and `personas.json` and writing the result to `raters.json` in
the shape documented there. Any model can fill it, local or hosted, provided each
rater is an independent call returning one 0-to-5 judgement per word per
dimension, with channels that do not apply left out rather than set to zero. Open
models run locally make the workflow free of any external service (Hussain et
al., 2024, *Behavior Research Methods*).
