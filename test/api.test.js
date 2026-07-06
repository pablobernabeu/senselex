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
    assert.equal(norms.rows[0].n, 3);
    assert.equal(norms.rows[0].dominantModality, 'smell');
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
    assert.match(text, /concept_id,word,n,mean_touch/);
    assert.match(text, /coffee/);
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
