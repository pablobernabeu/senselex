// The jsPsych plugin must stay in lock-step with the domain constants: same
// eleven dimensions, same 0-to-5 scale, and a trial shape the Atlas validators
// accept once mapped onto their field names. These tests evaluate the plugin file the way a browser
// would (a classic script against a jsPsychModule global) and then push a
// synthetic trial result through validateRating.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALL_DIMENSIONS, RATING_MIN, RATING_MAX } from '../src/domain/dimensions.js';
import { validateRating } from '../src/domain/validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../integrations/jspsych/plugin-senselex-rating.js'), 'utf8');

function loadPlugin() {
  const jsPsychModule = {
    ParameterType: { STRING: 'STRING', OBJECT: 'OBJECT', INT: 'INT', HTML_STRING: 'HTML_STRING', BOOL: 'BOOL' },
  };
  const factory = new Function(
    'jsPsychModule',
    `${source}\nreturn jsPsychSenselexRating;`,
  );
  return factory(jsPsychModule);
}

test('plugin evaluates as a classic script and declares itself', () => {
  const Plugin = loadPlugin();
  assert.equal(Plugin.info.name, 'senselex-rating');
  assert.equal(typeof Plugin.prototype.trial, 'function');
});

test('plugin default dimensions match the domain constants exactly', () => {
  const Plugin = loadPlugin();
  assert.deepEqual(Plugin.info.parameters.dimensions.default, [...ALL_DIMENSIONS]);
});

test('a trial result maps onto a rating the Atlas validators accept', () => {
  // The shape the plugin finishes a trial with, mapped the way the browser
  // edition and the jsPsych export map it before submission.
  const trialData = {
    concept_id: 'CAFÉ',
    word: 'café',
    language: 'fra',
    dims: { smell: 5, taste: 4.5, vision: 2 },
    rt: 8000,
  };
  const validated = validateRating({
    clientId: 'jsx-test-1',
    languageCode: trialData.language,
    conceptId: trialData.concept_id,
    word: trialData.word,
    participantRef: 'P01',
    ratings: trialData.dims,
  });
  assert.equal(validated.conceptId, 'CAFÉ');
  assert.deepEqual(validated.ratings, trialData.dims);
});

test('unicode concept identifiers from multilingual clients validate', () => {
  for (const conceptId of ['ACCIÓN', 'ΝΕΡΌ', 'قهوة', '水']) {
    const value = validateRating({
      clientId: 'jsx-test-2',
      languageCode: 'xxx',
      conceptId,
      word: 'w',
      ratings: { touch: RATING_MIN, vision: RATING_MAX },
    });
    assert.equal(value.conceptId, conceptId);
  }
});

// A display element just rich enough for the plugin: it hands back one object per
// selector, with a value and click handlers, so a trial can be driven without a
// browser.
function fakeDisplay(values = {}) {
  const nodes = new Map();
  const node = (selector) => {
    if (!nodes.has(selector)) {
      const listeners = {};
      nodes.set(selector, {
        value: values[selector.replace('#sx-', '')] ?? '',
        textContent: '',
        addEventListener: (type, fn) => { listeners[type] = fn; },
        click: () => listeners.click(),
      });
    }
    return nodes.get(selector);
  };
  return { innerHTML: '', querySelector: node, node };
}

function runTrial(values) {
  const Plugin = loadPlugin();
  const finished = [];
  const plugin = new Plugin({ finishTrial: (data) => finished.push(data) });
  const display = fakeDisplay(values);
  plugin.trial(display, {
    word: 'café', concept_id: 'COFFEE', language: 'fra', direction: 'ltr',
    dimensions: [...ALL_DIMENSIONS], preamble: '', button_label: 'Save', dont_know_label: "Don't know",
  });
  return { display, finished };
}

test('plugin version 2 marks trials collected under the Lancaster wording', () => {
  assert.equal(loadPlugin().info.version, '2.0.0');
});

test('a saved trial carries its ratings and dont_know false', () => {
  const { display, finished } = runTrial({ smell: '5', taste: '4.5' });
  display.node('#sx-save').click();
  assert.equal(finished.length, 1);
  assert.deepEqual(finished[0].dims, { smell: 5, taste: 4.5 });
  assert.equal(finished[0].dont_know, false);
});

test('the dont-know button ends the trial with no ratings', () => {
  const { display, finished } = runTrial({ smell: '5' });
  display.node('#sx-dk').click();
  assert.equal(finished.length, 1);
  assert.deepEqual(finished[0].dims, {});
  assert.equal(finished[0].dont_know, true);
});

test('saving with no rating asks for one and does not end the trial', () => {
  const { display, finished } = runTrial({});
  display.node('#sx-save').click();
  assert.equal(finished.length, 0);
  assert.match(display.node('#sx-msg').textContent, /at least one rating/);
});
