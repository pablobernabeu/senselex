/**
 * plugin-senselex-rating
 *
 * A jsPsych plugin for Lancaster-protocol sensorimotor rating trials: one word,
 * eleven perceptual and action channels, each rated 0 to 5 with partial vectors
 * allowed, exactly as in the SenseLex suite (and following Lynott, Connell,
 * Brysbaert, Brand & Carney, 2020, Behavior Research Methods,
 * https://doi.org/10.3758/s13428-019-01316-z). Use it to embed the SenseLex
 * instrument in your own jsPsych timeline. A rated trial's data satisfy the
 * SenseLex Atlas validators once mapped onto its field names, and don't-know
 * trials are left out.
 *
 * Usage (jsPsych 7 or 8, classic script include):
 *   <script src="plugin-senselex-rating.js"></script>
 *   timeline.push({
 *     type: jsPsychSenselexRating,
 *     word: 'café',
 *     concept_id: 'COFFEE',
 *     language: 'fra',
 *     direction: 'ltr',          // 'rtl' for Arabic, Hebrew...
 *   });
 *
 * Data generated per trial: concept_id, word, language, dims (an object with
 * one 0-5 number per answered dimension), dont_know (true when the participant
 * pressed "Don't know this word", in which case dims is empty) and rt in
 * milliseconds. A don't-know trial is the Lancaster procedure's "Don't know the
 * meaning of this word" response: it records that the word was unknown and must
 * not be averaged into the norms.
 *
 * Version 2.0.0 adopted the Lancaster wording (every channel rated, 0 rather
 * than a blank for a channel not experienced, "Head excluding mouth") and added
 * the don't-know response. jsPsych 8 stores the plugin version with every trial
 * (plugin_version), so data collected under version 1 can be told apart; under
 * jsPsych 7, the dont_know field marks version-2 trials.
 */
var jsPsychSenselexRating = (function (jspsych) {
  'use strict';

  var PERCEPTUAL = ['touch', 'hearing', 'smell', 'taste', 'vision', 'interoception'];
  var ACTION = ['mouth_throat', 'hand_arm', 'foot_leg', 'head', 'torso'];
  var ALL = PERCEPTUAL.concat(ACTION);
  // Worded as in the Lancaster Sensorimotor Norms questionnaires (Lynott et al.,
  // 2020; osf.io/3m2yg). "Head excluding mouth" matters: without it, speaking and
  // eating earn head credit that the published norms put under mouth alone.
  var LABELS = {
    touch: 'By feeling through touch', hearing: 'By hearing', smell: 'By smelling',
    taste: 'By tasting', vision: 'By seeing', interoception: 'By sensations inside your body',
    mouth_throat: 'Mouth / throat', hand_arm: 'Hand / arm', foot_leg: 'Foot / leg',
    head: 'Head excluding mouth', torso: 'Torso',
  };

  var info = {
    name: 'senselex-rating',
    version: '2.0.0',
    parameters: {
      /** The word to rate, displayed as the stimulus. */
      word: { type: jspsych.ParameterType.STRING, default: undefined },
      /** Stable concept identifier stored with the data (e.g. COFFEE). */
      concept_id: { type: jspsych.ParameterType.STRING, default: '' },
      /** Language code stored with the data (e.g. fra). */
      language: { type: jspsych.ParameterType.STRING, default: '' },
      /** Text direction of the stimulus: ltr or rtl. */
      direction: { type: jspsych.ParameterType.STRING, default: 'ltr' },
      /** Dimensions to present; defaults to the full Lancaster set of eleven. */
      dimensions: { type: jspsych.ParameterType.OBJECT, default: ALL },
      /** Instruction shown above the rating grid. */
      preamble: {
        type: jspsych.ParameterType.HTML_STRING,
        default: 'To what extent do you experience this word? Rate every channel from 0 (not at all) ' +
          'to 5 (greatly): the first six by each sense, the last five by performing an action with ' +
          'that part of the body. A channel through which you do not experience the word at all is a 0, not a blank. ' +
          "If you do not know the meaning of the word, press \"Don't know this word\".",
      },
      /** Label of the save button. */
      button_label: { type: jspsych.ParameterType.STRING, default: 'Save and continue' },
      /** Label of the button that records the word as unknown. */
      dont_know_label: { type: jspsych.ParameterType.STRING, default: "Don't know this word" },
    },
    data: {
      /** Concept identifier as supplied. */
      concept_id: { type: jspsych.ParameterType.STRING },
      /** Word as displayed. */
      word: { type: jspsych.ParameterType.STRING },
      /** Language code as supplied. */
      language: { type: jspsych.ParameterType.STRING },
      /** One 0-5 value per answered dimension; empty when dont_know is true. */
      dims: { type: jspsych.ParameterType.OBJECT },
      /** True when the participant did not know the word. */
      dont_know: { type: jspsych.ParameterType.BOOL },
      /** Milliseconds from render to save. */
      rt: { type: jspsych.ParameterType.INT },
    },
  };

  function SenselexRatingPlugin(jsPsych) {
    this.jsPsych = jsPsych;
  }
  SenselexRatingPlugin.info = info;

  SenselexRatingPlugin.prototype.trial = function (display_element, trial) {
    var jsPsych = this.jsPsych;
    var t0 = performance.now();
    var dims = trial.dimensions && trial.dimensions.length ? trial.dimensions : ALL;

    var html = '<div style="font-size:2.2rem;font-weight:600;margin:.6rem 0" dir="' +
      trial.direction + '"' + (trial.language ? ' lang="' + trial.language + '"' : '') + '>' +
      trial.word + '</div>';
    html += '<div>' + trial.preamble + '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));' +
      'gap:.3rem 1.4rem;max-width:46rem;margin:1rem auto;text-align:left">';
    for (var i = 0; i < dims.length; i++) {
      var d = dims[i];
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem">' +
        '<label for="sx-' + d + '">' + (LABELS[d] || d) + '</label>' +
        '<input id="sx-' + d + '" type="number" min="0" max="5" step="0.5" ' +
        'style="width:4.6rem;font:inherit;padding:.25rem"></div>';
    }
    html += '</div><button id="sx-save" class="jspsych-btn">' + trial.button_label +
      '</button> <button id="sx-dk" class="jspsych-btn">' + trial.dont_know_label +
      '</button><p id="sx-msg" role="status"></p>';
    display_element.innerHTML = html;

    display_element.querySelector('#sx-save').addEventListener('click', function () {
      var values = {};
      var any = false;
      for (var i = 0; i < dims.length; i++) {
        var d = dims[i];
        var raw = display_element.querySelector('#sx-' + d).value;
        if (raw !== '') {
          var n = Number(raw);
          if (isFinite(n) && n >= 0 && n <= 5) { values[d] = n; any = true; }
        }
      }
      if (!any) {
        display_element.querySelector('#sx-msg').textContent =
          'Enter at least one rating between 0 and 5 before saving.';
        return;
      }
      finish(values, false);
    });
    display_element.querySelector('#sx-dk').addEventListener('click', function () {
      finish({}, true);
    });

    function finish(values, dontKnow) {
      display_element.innerHTML = '';
      jsPsych.finishTrial({
        concept_id: trial.concept_id,
        word: trial.word,
        language: trial.language,
        dims: values,
        dont_know: dontKnow,
        rt: Math.round(performance.now() - t0),
      });
    }
  };

  return SenselexRatingPlugin;
})(typeof jsPsychModule !== 'undefined' ? jsPsychModule : { ParameterType: {} });

if (typeof module !== 'undefined' && module.exports) {
  module.exports = jsPsychSenselexRating;
}
