import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer, AUTH } from './helpers.js';

test('health endpoint reports a summary', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.summary.languages, 'number');
  } finally {
    await server.stop();
  }
});

test('write endpoints reject requests without a valid token', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/v1/languages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'tst', name: 'Test', script: 'Latin' }),
    });
    assert.equal(response.status, 401);
  } finally {
    await server.stop();
  }
});

test('a language can be created and then read back', async () => {
  const server = await startTestServer();
  try {
    const create = await fetch(`${server.base}/v1/languages`, {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ code: 'tst', name: 'Testish', script: 'Latin', orthographicDepth: 'deep' }),
    });
    assert.equal(create.status, 200);
    const list = await (await fetch(`${server.base}/v1/languages`)).json();
    assert.ok(list.rows.some((row) => row.code === 'tst'));
  } finally {
    await server.stop();
  }
});

test('valid ratings are stored and surfaced as computed norms', async () => {
  const server = await startTestServer();
  try {
    await fetch(`${server.base}/v1/languages`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ code: 'tst', name: 'Testish', script: 'Latin' }),
    });
    await fetch(`${server.base}/v1/concepts`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ id: 'COFFEE', gloss: 'coffee' }),
    });
    for (let i = 0; i < 3; i += 1) {
      const response = await fetch(`${server.base}/v1/ratings`, {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({
          clientId: `r-${i}`,
          languageCode: 'tst',
          conceptId: 'COFFEE',
          word: 'coffee',
          ratings: { smell: 5, taste: 4, vision: 2 },
        }),
      });
      assert.equal(response.status, 200);
    }
    const norms = await (await fetch(`${server.base}/v1/norms/sensorimotor?language=tst`)).json();
    assert.equal(norms.rows.length, 1);
    assert.equal(norms.rows[0].word, 'coffee');
    assert.equal(norms.rows[0].nRecords, 3);
    assert.equal(norms.rows[0].dominantModality, 'smell');
    // The three raters filled three channels each, so those carry a count of
    // three and the eight they left blank carry zero and a null mean rather
    // than a fabricated zero.
    assert.equal(norms.rows[0].n.smell, 3);
    assert.equal(norms.rows[0].n.touch, 0);
    assert.equal(norms.rows[0].mean.touch, null);
    assert.equal(norms.rows[0].perceptualChannels, 3);
  } finally {
    await server.stop();
  }
});

test('invalid ratings are rejected with a 422 and reasons', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/v1/ratings`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        clientId: 'bad-1',
        languageCode: 'tst',
        conceptId: 'COFFEE',
        word: 'coffee',
        ratings: { smell: 9 },
      }),
    });
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.ok(Array.isArray(body.detail) && body.detail.length > 0);
  } finally {
    await server.stop();
  }
});

test('sync is idempotent: re-sending a batch creates no duplicates', async () => {
  const server = await startTestServer();
  try {
    const batch = {
      records: [
        { kind: 'rating', clientId: 'sync-a', languageCode: 'tst', conceptId: 'SMOKE', word: 'smoke', ratings: { smell: 5 } },
        { kind: 'response', clientId: 'sync-b', languageCode: 'tst', conceptId: 'SMOKE', name: 'acrid', responseType: 'abstract' },
      ],
    };
    const first = await (await fetch(`${server.base}/v1/sync`, { method: 'POST', headers: AUTH, body: JSON.stringify(batch) })).json();
    assert.equal(first.inserted, 2);
    const second = await (await fetch(`${server.base}/v1/sync`, { method: 'POST', headers: AUTH, body: JSON.stringify(batch) })).json();
    assert.equal(second.inserted, 0);
    assert.equal(second.duplicates, 2);
  } finally {
    await server.stop();
  }
});

test('CSV export carries a header and a data row', async () => {
  const server = await startTestServer();
  try {
    await fetch(`${server.base}/v1/ratings`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ clientId: 'e-1', languageCode: 'tst', conceptId: 'COFFEE', word: 'coffee', ratings: { smell: 5, taste: 4 } }),
    });
    const response = await fetch(`${server.base}/v1/export/sensorimotor.csv?language=tst`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    const text = await response.text();
    assert.match(text, /concept_id,word,n_records,mean_touch,n_touch/);
    assert.match(text, /coffee/);
    // An unrated channel exports as an empty cell beside a count of zero, so a
    // reader can tell "no one judged this" from "judged as nothing".
    assert.match(text, /,,0,/);
  } finally {
    await server.stop();
  }
});

test('the rate limiter returns 429 once the window is exhausted', async () => {
  const server = await startTestServer({ SENSELEX_RATE_MAX: '3', SENSELEX_RATE_WINDOW_MS: '60000' });
  try {
    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await fetch(`${server.base}/health`)).status);
    }
    assert.ok(statuses.includes(429), `expected a 429 among ${statuses.join(',')}`);
  } finally {
    await server.stop();
  }
});

test('unknown routes return 404', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/v1/nope`);
    assert.equal(response.status, 404);
  } finally {
    await server.stop();
  }
});

test('reference-data writes are validated like measurement writes', async () => {
  // These two routes previously accepted whatever they were sent, so a malformed
  // language produced a 500 and a concept id containing markup returned 200. The
  // concept catalogue is what every rating keys on, so it gets the same
  // identifier check as the ratings themselves.
  const server = await startTestServer();
  try {
    const badLanguage = await fetch(`${server.base}/v1/languages`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ code: 'tst', name: 'Testish', script: 'Latin', direction: 'sideways' }),
    });
    assert.equal(badLanguage.status, 422);

    const badConcept = await fetch(`${server.base}/v1/concepts`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ id: '<script>alert(1)</script>', gloss: 'nope' }),
    });
    assert.equal(badConcept.status, 422);

    // An unverified Concepticon identifier is refused on shape, because a wrong
    // link silently joins two unrelated concepts in any later merge.
    const badLink = await fetch(`${server.base}/v1/concepts`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ id: 'LEMON', gloss: 'lemon', concepticonId: 'husk' }),
    });
    assert.equal(badLink.status, 422);

    const good = await fetch(`${server.base}/v1/concepts`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ id: 'SMOKE', gloss: 'smoke', concepticonId: '778' }),
    });
    assert.equal(good.status, 200);
  } finally {
    await server.stop();
  }
});

test('CSV export returns every row rather than one page', async () => {
  // The export used to request a single page and present it as the whole
  // dataset, so a language with more words than the page size lost most of them
  // silently.
  const server = await startTestServer({ SENSELEX_MAX_PAGE_SIZE: '5' });
  try {
    await fetch(`${server.base}/v1/languages`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ code: 'big', name: 'Bigish', script: 'Latin' }),
    });
    const words = 12;
    for (let i = 0; i < words; i += 1) {
      await fetch(`${server.base}/v1/concepts`, {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({ id: `W${i}`, gloss: `w${i}` }),
      });
      await fetch(`${server.base}/v1/ratings`, {
        method: 'POST', headers: AUTH,
        body: JSON.stringify({
          clientId: `big-${i}`, languageCode: 'big', conceptId: `W${i}`, word: `w${i}`,
          ratings: { vision: 3, hearing: 1 },
        }),
      });
    }
    const response = await fetch(`${server.base}/v1/export/sensorimotor.csv?language=big`);
    const lines = (await response.text()).trim().split('\n');
    assert.equal(lines.length, words + 1, 'one header line plus one line per word');
    assert.equal(response.headers.get('x-total-rows'), String(words));
  } finally {
    await server.stop();
  }
});

test('the export filename cannot carry a crafted language code', async () => {
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/v1/export/sensorimotor.csv?language=${encodeURIComponent('x"; filename="evil.csv')}`);
    assert.equal(response.status, 400);
  } finally {
    await server.stop();
  }
});

test('a submission naming a participant is accepted, as the recruitment pipeline requires', async () => {
  // The study-link mode locks the participant reference to the recruitment
  // panel's identifier and sends it with every record, but nothing registered a
  // participant first, so the foreign key refused the whole batch. Every
  // Prolific submission therefore failed with "Unknown language or concept".
  const server = await startTestServer();
  try {
    const response = await fetch(`${server.base}/v1/sync`, {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({
        records: [{
          kind: 'rating',
          clientId: 'prolific-1',
          languageCode: 'tst',
          conceptId: 'COFFEE',
          word: 'coffee',
          participantRef: '5f2a91c4e8b7d3a06c1f4e2b',
          ratings: { smell: 4, vision: 2 },
        }],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).inserted, 1);
  } finally {
    await server.stop();
  }
});
