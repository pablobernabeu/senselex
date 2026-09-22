# Predictions and analysis plan for the 300-word panel

Written and committed on 23 September 2026, before any rating in the 300-word
panel was collected. The commit that adds this file precedes the commit that adds
the panel's output, so the order can be checked in the repository history.

## Why a second panel

A pilot panel of twelve simulated raters rated 60 English words (July to August
2026, model `claude-opus-5`). Two things came out of it that the pilot cannot
settle. First, Xu et al. (2025, *Nature Human Behaviour*, 9, 1871-1886) report
that agreement between language-model and human ratings falls from
non-sensorimotor to sensory dimensions and is minimal on the motor ones, using
GPT-3.5, GPT-4, PaLM and Gemini on about 4,400 words. At n = 60 the pilot's
per-channel intervals are too wide to say whether a 2026 model shows the same
pattern. Second, the pilot instructions departed from the published Lancaster
protocol in wording: they allowed a blank for a channel that "does not apply",
labelled the head effector "head" where Lancaster says "head excluding mouth",
anchored the top of the scale "very strongly" where Lancaster says "greatly", and
allowed half points where Lancaster used whole numbers.

This panel uses the Lancaster wording, on a sample large enough to estimate each
channel's agreement to within about .1.

## Design

**Words.** 300 English words from the application's curated bank, all present in
the Lancaster release and all with a nonzero wordfreq frequency: six concreteness
bands of 50, spread across the frequency range within each band
(`sample_words.mjs`, deterministic). Of these, 54 are pilot words kept to measure
stability across model versions (the *overlap set*); the other 246 are new to any
simulated rater (the *confirmatory set*). The six pilot words absent from the
frequency corpus are dropped.

**Raters.** The same twelve personas as the pilot (`personas.json`). Each rater
rates all 300 words in five lists of 60, each list a separate model call with no
shared context and no tools, in an order shuffled per rater from a fixed seed.
Lancaster participants likewise rated lists of about 48 words.

**Instrument.** The Lancaster questions verbatim: "To what extent do you
experience WORD" by sensations inside your body, tasting, smelling, feeling
through touch, hearing and seeing; and "To what extent do you experience WORD by
performing an action with the" head excluding mouth, foot / leg, hand / arm,
mouth / throat and torso; each from 0 (not at all) to 5 (greatly) in whole
numbers, with "Don't know the meaning of this word" as the only alternative to
rating. The two questions appear together for each word, as in SenseLex, where
Lancaster gave them to different participants.

**Stopping rule.** One run. A list that fails to return well-formed output is
re-requested once and the fact is recorded; no list is re-run because of its
content, and no rater or word is excluded after seeing the results.

## Hypotheses

All tests use the confirmatory set (246 words) unless stated. Human values are
the published Lancaster means.

**H1, domain gradient (from Xu et al., 2025).** Machine-human agreement,
measured as Spearman's rho between the machine panel's per-word means and the
Lancaster means, is lower on average over the five action channels than over
the six perceptual channels. Test: d = mean rho(perceptual) - mean rho(action),
with a 95% percentile interval from 10,000 bootstrap resamples of words (seed
20260923). H1 is supported if the interval excludes zero on the positive side,
contradicted if it excludes zero on the negative side, and unresolved otherwise.
For the record, the pilot gave d = +.05 in Pearson terms (perceptual .70, action
.65) on a different model and different wording, so the pilot leans the same way
as Xu et al. but weakly.

**H2, variance compression.** The machine panel agrees with itself more closely
than human raters do. Measure: single-rater reliability per channel, computed
identically for both panels by splitting each word's raters at random into two
halves, correlating the half-means across words, and stepping the result down to
one rater with the Spearman-Brown formula, averaged over 200 random splits.
Human values come from the Lancaster trial-level data for the same words.
Prediction: machine exceeds human on all eleven channels.

**H3, level bias.** Replicating the pilot's direction: across the confirmatory
words, the machine panel's mean maximum perceptual strength exceeds the human
mean, and its mean modality exclusivity falls below the human mean. Tested with
paired bootstrap intervals over words.

## Exploratory, labelled as such in any report

- Head-channel agreement under the corrected "head excluding mouth" wording,
  compared descriptively with the pilot's .45. Model and wording both changed,
  so this cannot isolate the wording.
- Stability across model versions on the 54 overlap words: per-channel
  correlation between the pilot means and the new means.
- Pearson alongside Spearman for every agreement figure.
- Sensitivity of every result to treating any blank as 0 instead of as missing,
  should the raters leave blanks despite the instructions.

## What would count against the instrument rather than the raters

Nothing in H1 to H3 tests SenseLex's correctness, which the reproduction analysis
does. These hypotheses concern what simulated raters can and cannot stand in for.
A result either way is reported.

## Amendment 1, 23 September 2026, before any panel rating was collected

Committed after the analyses of the human trial-level data had been run and
before the machine panel was collected. Nothing below was informed by machine
ratings; both changes were informed by the human data, as stated.

**Estimator for H2.** The plan above split each word's raters in half. Run on the
Lancaster trial data, that estimator proved biased: because words differ in how
many raters they have, and a mean's reliability rises less than linearly with
its rater count, the mixture of half sizes pulls the single-rater estimate down.
The analysis's own check showed it, predicting .70 for an eight-rater mean of
touch ratings where two disjoint eight-rater means correlated at .76. H2 is
therefore computed with a fixed half size of six raters for both panels, using
only words with at least twelve ratings, which the machine panel meets exactly.
H2's prediction and its test are otherwise unchanged.

**H1b, added: is the domain gradient a reliability artefact?** The same human
data show that people agree with one another far less on the action channels than
on the perceptual ones: on the 300 panel words, by the first estimator,
single-rater reliability was .08 for head and .13 for torso against .37 for taste
and .32 for smell. No measure can
correlate with a criterion more strongly than the criterion's reliability allows,
so a lower machine-human agreement on the action channels could come from the
human norms rather than from what the model knows. H1 cannot tell these apart.

Test: correct each channel's Pearson correlation between machine and human means
for attenuation (Spearman, 1904), using the reliability of each set of means,
taken as the single-rater reliability stepped up with Spearman-Brown to the
harmonic mean number of raters per word. Recompute the domain gap on the
corrected correlations, with a bootstrap interval over the 246 confirmatory words
(10,000 resamples, seed 20260923) in which the reliabilities are held fixed at
their full-sample values; the interval therefore ignores the uncertainty in the
reliabilities and will be somewhat too narrow, which is stated wherever it is
reported.

Prediction, stated both ways because the human data make neither outcome safe:
if the gradient is a reliability artefact, the corrected gap will be smaller than
the uncorrected Pearson gap and its interval will include zero; if the gradient
reflects what the model recovers, the corrected gap will stay positive with an
interval excluding zero.
