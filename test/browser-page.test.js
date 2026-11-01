// The browser edition's interface needs a DOM, which Node does not have, so this
// test loads web-static/index.html in headless Chromium through Playwright. The
// project installs no dependencies, so the test runs only where Playwright and
// its Chromium are already installed and skips otherwise, as it does in CI.
//
// A concept with a single naming response has no agreement figure, because
// agreement needs two responses to compare. Explore must show that cell blank,
// like any other undefined measure, and still draw the codability table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PAGE = pathToFileURL(resolve(here, '../web-static/index.html')).href;

// Loaded with require rather than import, so that a Playwright installed
// globally and found through NODE_PATH is used too.
let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}

test('Explore shows a concept with a single naming response', { skip: chromium ? false : 'Playwright is not installed' }, async (t) => {
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    t.skip('Playwright cannot launch Chromium');
    return;
  }
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(PAGE);

    await page.selectOption('#c-language', 'eng');
    await page.selectOption('#c-task', 'naming');
    await page.fill('#c-participant', 'P01');
    await page.fill('#cn-name', 'smoky');
    await page.click('#c-area button.act');

    await page.click('#tabs button[data-view="explore"]');
    await page.selectOption('#e-language', 'eng');
    const rows = await page.$$eval('#e-cod tbody tr', (trs) => trs.map((tr) => [...tr.cells].map((td) => td.textContent)));

    assert.deepEqual(errors, []);
    assert.equal(rows.length, 1);
    // Responses, distinct names, agreement and mean length.
    assert.deepEqual(rows[0].slice(1), ['1', '1', '', '1.00']);
  } finally {
    await browser.close();
  }
});
