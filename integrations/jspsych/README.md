# SenseLex and jsPsych

SenseLex and jsPsych complement each other. jsPsych (de Leeuw, 2015; de Leeuw,
Gilbert & Luchterhandt, 2023) is a general experiment engine with a large
plugin ecosystem, and SenseLex supplies the
norms-specific layer around it: curated multilingual word banks, a frequency-
and concreteness-controlled study builder, the Lancaster-protocol instrument,
the norm computations and an open database with idempotent synchronisation.
There are two ways to combine them.

## Export a SenseLex study as a jsPsych experiment

In the browser edition (`../../web-static/index.html`), build a word list under
Build & manage, then use "Run the study elsewhere" to download a ready-to-run
jsPsych 8 experiment for one language. The file runs on any static host, can be
adapted for a jsPsych hosting platform and reads Prolific's `PROLIFIC_PID` and a
`cc` completion-code parameter at run time. At the end, it offers the participant one
download of their data, either a SenseLex dataset JSON or a jsPsych CSV, saved
on the participant's own device. The file sends nothing anywhere. On a plain
static host, the data reach the researcher only if the participant passes the
file on, so to collect data centrally, add a step to the timeline that saves the
data to your server or platform. The SenseLex JSON imports straight back into the
browser edition (Import under Build & manage), so jsPsych-collected ratings join
the same norms as ratings collected natively. The full Atlas has no import for
these files yet.
The experiment loads exact versions of jsPsych (8.3.0) and its button plugin
(2.1.0) from jsDelivr, with integrity hashes, so it behaves the same whenever it
is run.

## Embed the SenseLex trial in your own timeline

`plugin-senselex-rating.js` is a standalone jsPsych plugin (jsPsych 7 and 8,
classic script include) implementing the sensorimotor rating trial: one word,
the eleven Lancaster dimensions, each rated 0 to 5, partial vectors allowed,
right-to-left rendering via the `direction` parameter. A "Don't know this word"
button ends the trial with `dont_know: true` and no ratings, the Lancaster
procedure's response for a word whose meaning the participant does not know. Leave such trials out of the norms. Include the plugin after jsPsych and push
trials of type `jsPsychSenselexRating`. Its parameters are `word` (the stimulus,
required), `concept_id` and `language` (stored with the data, and `language`
also sets the stimulus's `lang` attribute), `direction` (`ltr`, the default, or
`rtl`), `dimensions` (an array of channel keys such as `vision` or `hand_arm`,
all eleven by default), `preamble` (the instruction shown above the rating
grid), `button_label` (default "Save and continue") and `dont_know_label`
(default "Don't know this word"). Each trial records `concept_id`, `word`,
`language`, `dims` (one 0-to-5 number per answered channel, empty on a
don't-know trial), `dont_know` and `rt` in milliseconds. The plugin's `info`
block documents each parameter and data field.

Version 2.0.0 adopted the Lancaster wording and added the don't-know response.
jsPsych 8 stores the plugin version with every trial (`plugin_version`), so data
collected under version 1 can be told apart. jsPsych 7 does not record it, but
version-2 trials carry a `dont_know` field that version-1 trials lack.

The plugin cannot import the domain module, so it carries its own copy of the
eleven dimensions and the 0-to-5 scale of `../../src/domain/dimensions.js`, and
`../../test/integrations.test.js` checks that its default dimension list matches
that module. A rated trial therefore satisfies the Atlas validators once its
fields are mapped (`concept_id` to `conceptId`, `language` to `languageCode`,
`dims` to `ratings`, plus a `clientId`), as the browser edition does when a study
link submits ratings to an Atlas. Don't-know trials carry no ratings and are
left out.

The exported experiment does not stop a participant from marking every word as
unknown, as the browser edition does, so check the data before approving a
submission.

## References

de Leeuw, J. R. (2015). jsPsych: A JavaScript library for creating behavioral
experiments in a Web browser. *Behavior Research Methods*, 47(1), 1-12.
https://doi.org/10.3758/s13428-014-0458-y

de Leeuw, J. R., Gilbert, R. A., & Luchterhandt, B. (2023). jsPsych: Enabling an
open-source collaborative ecosystem of behavioral experiments. *Journal of Open
Source Software*, 8(85), 5351. https://doi.org/10.21105/joss.05351
