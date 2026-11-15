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
// keep the word as it was. The third test runs the experiment's last screen and
// checks that its CSV download writes each cell as csvCell does, with the
// columns and values of jsPsych's own CSV writer, and that its dataset download
// keeps the word as it was.

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

const csvq = new Function(`${slice('  const csvq = ', '\n  function downloadCsv(')}\nreturn csvq;`)();

// Cells of each kind: plain, needing quotes, formula-like, empty and missing.
const cells = [
  'water', 'café', '水', 'a,b', 'say "hi"', 'two\nlines', 'carriage\rreturn',
  '-ness', '+1', '@SUM(1)', '=HYPERLINK("https://example.org","x")', '\tindent', '\rleading',
  "'quoted", 'a-b', '', 0, 3.5, 12, null, undefined,
];

test('the browser edition writes CSV cells as the Atlas does', () => {
  for (const cell of cells) {
    assert.equal(csvq(cell), csvCell(cell), `csvq differs from csvCell for ${JSON.stringify(cell)}`);
  }
  assert.equal(csvq('-ness'), "'-ness");
  assert.equal(csvq('=HYPERLINK("https://example.org","x")'), `"'=HYPERLINK(""https://example.org"",""x"")"`);
  assert.equal(csvq('carriage\rreturn'), '"carriage\rreturn"');
});

// A display element and document just rich enough for the exported
// experiment: the rating trial writes its HTML into the element and finds its
// buttons and inputs by id, and the last screen saves a file through a link it
// creates and clicks. Blob and URL stand-ins record what each download holds.
function fakeBrowser() {
  const nodes = new Map();
  const downloads = [];
  const document = {
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
    createElement: () => ({
      click() { downloads.push({ name: this.download, type: this.href.type, text: this.href.text }); },
      remove() {},
    }),
    body: { appendChild() {} },
  };
  class Blob {
    constructor(parts, options) {
      this.text = parts.join('');
      this.type = options.type;
    }
  }
  const URL = { createObjectURL: (blob) => blob };
  return { document, Blob, URL, downloads };
}

const language = { code: 'xx', name: 'Lang <i>x</i> & co', script: 'Latin', direction: 'rtl"><b>', family: 'added' };
const items = [
  { language: 'xx', conceptId: 'TAG', gloss: 'tag', word: '<img src=x onerror="alert(1)">' },
  { language: 'xx', conceptId: 'AMP', gloss: 'ampersand', word: 'AT&T' },
];

// The exported page for language xx, built by the page's own buildJsPsychHtml.
function exportPage() {
  const source = slice('  function buildJsPsychHtml(code){', '\n  function exportJsPsych(');
  const data = { languages: [language], items };
  const itemsFor = (code) => items.filter((it) => it.language === code);
  const labels = Object.fromEntries(ALL_DIMENSIONS.map((d) => [d, d]));
  const build = new Function('data', 'itemsFor', 'ALL', 'RATING_LABELS', 'APP_VERSION', 'csvq', `${source}\nreturn buildJsPsychHtml;`)(
    data, itemsFor, [...ALL_DIMENSIONS], labels, '0.0.0-test', csvq,
  );
  return build('xx');
}

// Runs the experiment's own script, the last script element of the page,
// against a stand-in for jsPsych whose stored data are `rows`. Returns the
// stand-in and the timeline that the script passes to jsPsych.run.
function runExperiment(page, browser, rows = []) {
  const open = page.lastIndexOf('<script>');
  const close = page.indexOf('</script>', open);
  const script = page.slice(open + '<script>'.length, close);
  const timeline = [];
  const jsPsych = {
    finished: [],
    run: (t) => timeline.push(...t),
    finishTrial: (trialData) => jsPsych.finished.push(trialData),
    data: {
      get: () => ({
        values: () => rows,
        filter: (f) => ({ values: () => rows.filter((r) => r.trial_type === f.trial_type) }),
      }),
    },
  };
  new Function('initJsPsych', 'jsPsychHtmlButtonResponse', 'location', 'document', 'Blob', 'URL', script)(
    () => jsPsych, 'html-button-response', { search: '' }, browser.document, browser.Blob, browser.URL,
  );
  return { timeline, jsPsych };
}

test('the jsPsych export shows words and language names as text', () => {
  const page = exportPage();

  assert.match(page, /<title>SenseLex sensorimotor rating \(Lang &lt;i&gt;x&lt;\/i&gt; &amp; co\)<\/title>/);
  assert.ok(!page.includes('<i>x</i>'), 'the language name must not reach the page as markup');

  const browser = fakeBrowser();
  const { timeline, jsPsych } = runExperiment(page, browser);
  const finished = jsPsych.finished;

  assert.match(timeline[0].stimulus, /2 words in Lang &lt;i&gt;x&lt;\/i&gt; &amp; co,/);
  const trials = timeline.filter((t) => t.word !== undefined);
  assert.equal(trials.length, 2);

  const Plugin = trials[0].type;
  const display = { innerHTML: '' };
  new Plugin(jsPsych).trial(display, trials[0]);
  assert.ok(display.innerHTML.includes('dir="rtl&quot;&gt;&lt;b&gt;"'), 'the direction must stay inside its attribute');
  assert.ok(display.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'), 'the word must be shown as text');
  assert.ok(!display.innerHTML.includes('<img'), 'the word must not reach the trial as markup');
  browser.document.getElementById('sx-dk').click();
  assert.equal(finished.length, 1);
  assert.equal(finished[0].word, items[0].word, 'the trial data must keep the word as it was');

  const second = { innerHTML: '' };
  new Plugin(jsPsych).trial(second, trials[1]);
  assert.ok(second.innerHTML.includes('>AT&amp;T</div>'));
});

test("the jsPsych export writes the participant's CSV as the Atlas does", () => {
  const page = exportPage();

  // One row for each kind of cell. jsPsych's own writer turns an object,
  // null included, into JSON, so null reaches the cell writer as 'null'.
  const each = fakeBrowser();
  const first = runExperiment(page, each, cells.map((word) => ({ word }))).timeline;
  first[first.length - 1].on_finish({ response: 1 });
  assert.equal(each.downloads.length, 1);
  assert.match(each.downloads[0].name, /^senselex-jspsych-xx-web-[0-9a-f]+\.csv$/);
  assert.equal(each.downloads[0].type, 'text/csv');
  const expected = ['word', ...cells.map((c) => csvCell(c === null ? 'null' : c))];
  assert.equal(each.downloads[0].text, `${expected.join('\r\n')}\r\n`);

  // Rows as jsPsych stores them: the columns in order of first appearance, an
  // empty cell where a row lacks a column and objects as JSON.
  const rows = [
    { rt: 812, stimulus: '<h2>Word rating study</h2>', response: 0, trial_type: 'html-button-response', trial_index: 0 },
    { rt: 4021, concept_id: '@X', word: '-ness', dims: { vision: 2, hand_arm: 0.5 }, dont_know: false, trial_type: 'senselex-rating', trial_index: 1 },
    { rt: null, concept_id: 'LINK', word: '=HYPERLINK("https://example.org","x")', dims: {}, dont_know: true, trial_type: 'senselex-rating', trial_index: 2 },
  ];
  const browser = fakeBrowser();
  const { timeline } = runExperiment(page, browser, rows);
  const last = timeline[timeline.length - 1];
  last.on_finish({ response: 1 });
  assert.equal(browser.downloads[0].text, [
    'rt,stimulus,response,trial_type,trial_index,concept_id,word,dims,dont_know',
    '812,<h2>Word rating study</h2>,0,html-button-response,0,,,,',
    `4021,,,senselex-rating,1,'@X,'-ness,"{""vision"":2,""hand_arm"":0.5}",false`,
    `null,,,senselex-rating,2,LINK,"'=HYPERLINK(""https://example.org"",""x"")",{},true`,
    '',
  ].join('\r\n'));

  // The dataset download keeps each word as it was.
  last.on_finish({ response: 0 });
  assert.equal(browser.downloads[1].type, 'application/json');
  assert.match(browser.downloads[1].name, /^senselex-jspsych-xx-web-[0-9a-f]+\.json$/);
  const dataset = JSON.parse(browser.downloads[1].text);
  assert.deepEqual(dataset.ratings.map((r) => [r.conceptId, r.word]), [['@X', '-ness']]);
  assert.deepEqual(dataset.skips.map((r) => [r.conceptId, r.word]), [['LINK', '=HYPERLINK("https://example.org","x")']]);
});
