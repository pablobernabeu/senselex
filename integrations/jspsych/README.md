# SenseLex and jsPsych

SenseLex and jsPsych complement each other rather than competing. jsPsych
(de Leeuw, 2015; de Leeuw, Gilbert & Luchterhandt, 2023) is a general
experiment engine with a large plugin ecosystem; SenseLex supplies the
norms-specific layer around it: curated multilingual word banks, a frequency-
and concreteness-controlled study builder, the Lancaster-protocol instrument,
the norm computations and an open database with idempotent synchronisation.
There are two ways to combine them.

## Export a SenseLex study as a jsPsych experiment

In the browser edition (`../../web-static/index.html`), build a word list under
Build & manage, then use "Run the study elsewhere" to download a ready-to-run
jsPsych 8 experiment for one language. The file runs on any static host or
jsPsych-compatible platform, reads Prolific's `PROLIFIC_PID` and a `cc`
completion-code parameter at run time, and saves its data both as a jsPsych CSV
and as a SenseLex dataset JSON. That JSON imports straight back into the
browser edition (Import under Build & manage) or into the full Atlas, so
jsPsych-collected ratings join the same norms as ratings collected natively.

## Embed the SenseLex trial in your own timeline

`plugin-senselex-rating.js` is a standalone jsPsych plugin (jsPsych 7 and 8,
classic script include) implementing the sensorimotor rating trial: one word,
the eleven Lancaster dimensions, each rated 0 to 5, partial vectors allowed,
right-to-left rendering via the `direction` parameter. Include it after jsPsych
and push trials of type `jsPsychSenselexRating`; see the header comment for
parameters and the data each trial generates.

The dimensions and the 0-to-5 scale are the same constants the whole suite
uses (`../../src/domain/dimensions.js`), so data collected through the plugin
satisfy the Atlas validators unchanged.
