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
jsPsych 8 experiment for one language. The file runs on any static host or
jsPsych-compatible platform, reads Prolific's `PROLIFIC_PID` and a `cc`
completion-code parameter at run time, and saves its data both as a jsPsych CSV
and as a SenseLex dataset JSON. That JSON imports straight back into the
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
trials of type `jsPsychSenselexRating`. The header comment lists the parameters
and the data each trial generates.

Version 2.0.0 adopted the Lancaster wording and added the don't-know response.
jsPsych 8 stores the plugin version with every trial (`plugin_version`), so data
collected under version 1 can be told apart. jsPsych 7 does not record it, but
version-2 trials carry a `dont_know` field that version-1 trials lack.

The dimensions and the 0-to-5 scale are the same constants the whole suite
uses (`../../src/domain/dimensions.js`), so a rated trial satisfies the Atlas
validators once its fields are mapped (`concept_id` to `conceptId`, `language`
to `languageCode`, `dims` to `ratings`, plus a `clientId`), as the browser
edition's export does. Don't-know trials carry no ratings and are left out.

The exported experiment does not stop a participant from marking every word as
unknown, as the browser edition does, so check the data before approving a
submission.
