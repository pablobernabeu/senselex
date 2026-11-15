// The browser edition writes two kinds of file from data that may come from
// someone else, through an imported dataset or a study link: CSV downloads, and
// a jsPsych experiment that shows each item's word in HTML. These tests extract
// the code that writes them from web-static/index.html and run it in Node.
//
// csvq, the browser edition's CSV cell writer, is a copy of csvCell in
// src/server/export.js. Both must put a leading apostrophe on a cell that a
// spreadsheet would run as a formula and quote a cell holding a comma, a
// quotation mark or a line break, so the first test compares them over cells of
// each kind.
//
// buildJsPsychHtml writes the exported experiment. The second test builds one
// for a language whose name, direction and words hold markup, evaluates its
// script against a stand-in for jsPsych and checks that the title, the opening
// screen and a rating trial show these values as text, while the trial's data
// keep the word as it was.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { csvCell } from '../src/server/export.js';
import { ALL_DIMENSIONS } from '../src/domain/dimensions.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '../web-static/index.html'), 'utf8');

// The source from `start` up to, but not including, `end`, which must follow it.
function slice(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from);
  assert.ok(from !== -1 && to > from, `web-static/index.html must contain ${start.trim()}`);
  return html.slice(from, to);
}

test('the browser edition writes CSV cells as the Atlas does', () => {
  const source = slice('  const csvq = ', '\n  function downloadCsv(');
  const csvq = new Function(`${source}\nreturn csvq;`)();
  const cells = [
    'water', 'café', '水', 'a,b', 'say "hi"', 'two\nlines', 'carriage\rreturn',
    '-ness', '+1', '@SUM(1)', '=HYPERLINK("https://example.org","x")', '\tindent', '\rleading',
    "'quoted", 'a-b', '', 0, 3.5, 12, null, undefined,
  ];
  for (const cell of cells) {
    assert.equal(csvq(cell), csvCell(cell), `csvq differs from csvCell for ${JSON.stringify(cell)}`);
  }
  assert.equal(csvq('-ness'), "'-ness");
  assert.equal(csvq('=HYPERLINK("https://example.org","x")'), `"'=HYPERLINK(""https://example.org"",""x"")"`);
  assert.equal(csvq('carriage\rreturn'), '"carriage\rreturn"');
});

// A display element and document just rich enough for the exported rating
// trial, which writes its HTML into the element and finds its buttons and
// inputs by id.
function fakeDocument() {
  const nodes = new Map();
  return {
    nodes,
    getElementById(id) {
      if (!nodes.has(id)) {
        const listeners = {};
        nodes.set(id, {
          value: '',
          textContent: '',
          addEventListener: (type, fn) => { listeners[type] = fn; },
          click: () => listeners.click(),
        });
      }
      return nodes.get(id);
    },
  };
}

test('the jsPsych export shows words and language names as text', () => {
  const source = slice('  function buildJsPsychHtml(code){', '\n  function exportJsPsych(');
  const language = { code: 'xx', name: 'Lang <i>x</i> & co', script: 'Latin', direction: 'rtl"><b>', family: 'added' };
  const items = [
    { language: 'xx', conceptId: 'TAG', gloss: 'tag', word: '<img src=x onerror="alert(1)">' },
    { language: 'xx', conceptId: 'AMP', gloss: 'ampersand', word: 'AT&T' },
  ];
  const data = { languages: [language], items };
  const itemsFor = (code) => items.filter((it) => it.language === code);
  const labels = Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, d]));
  const build = new Function('data', 'itemsFor', 'ALL', 'RATING_LABELS', 'APP_VERSION', `${source}\nreturn buildJsPsychHtml;`)(
    data, itemsFor, [...ALL_DIMENSIONS], labels, '0.0.0-test',
  );
  const page = build('xx');

  assert.match(page, /<title>SenseLex sensorimotor rating \(Lang &lt;i&gt;x&lt;\/i&gt; &amp; co\)<\/title>/);
  assert.ok(!page.includes('<i>x</i>'), 'the language name must not reach the page as markup');

  // The experiment's own script is the last script element.
  const open = page.lastIndexOf('<script>');
  const close = page.indexOf('</script>', open);
  const script = page.slice(open + '<script>'.length, close);

  const timeline = [];
  const finished = [];
  const doc = fakeDocument();
  const jsPsych = {
    run: (t) => timeline.push(...t),
    finishTrial: (trialData) => finished.push(trialData),
    data: { get: () => ({ filter: () => ({ values: () => [] }), localSave: () => {} }) },
  };
  new Function('initJsPsych', 'jsPsychHtmlButtonResponse', 'location', 'document', script)(
    () => jsPsych, 'html-button-response', { search: '' }, doc,
  );

  assert.match(timeline[0].stimulus, /2 words in Lang &lt;i&gt;x&lt;\/i&gt; &amp; co,/);
  const trials = timeline.filter((t) => t.word !== undefined);
  assert.equal(trials.length, 2);

  const Plugin = trials[0].type;
  const display = { innerHTML: '' };
  new Plugin(jsPsych).trial(display, trials[0]);
  assert.ok(display.innerHTML.includes('dir="rtl&quot;&gt;&lt;b&gt;"'), 'the direction must stay inside its attribute');
  assert.ok(display.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'the word must be shown as text');
  assert.ok(!display.innerHTML.includes('<img'), 'the word must not reach the trial as markup');
  doc.getElementById('sx-dk').click();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].word, items[0].word, 'the trial data must keep the word as it was');

  const second = { innerHTML: '' };
  new Plugin(jsPsych).trial(second, trials[1]);
  assert.ok(second.innerHTML.includes('>AT&amp;T</div>'));
});
