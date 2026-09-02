import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers.js';
import { createOfflineClient, createMemoryStore } from '../src/offline/client.js';
import { validateSyncBatch } from '../src/domain/validation.js';
import { MAX_SYNC_BATCH } from '../src/domain/dimensions.js';

test('queued field records survive offline and sync when a connection returns', async () => {
  const server = await startTestServer();
  try {
    const store = createMemoryStore();
    const client = createOfflineClient({ store, endpoint: server.base, token: 'test-token' });

    await client.enqueueRating({ languageCode: 'jhi', conceptId: 'SMOKE', word: 'cŋɛs', ratings: { smell: 5, vision: 2 } });
    await client.enqueueResponse({ languageCode: 'jhi', conceptId: 'SMOKE', name: 'cŋɛs', responseType: 'abstract' });

    assert.equal((await client.pending()).length, 2);

    const result = await client.sync();
    assert.equal(result.inserted, 2);
    assert.equal((await client.pending()).length, 0, 'queue is cleared after a successful sync');

    const norms = await (await fetch(`${server.base}/v1/norms/sensorimotor?language=jhi`)).json();
    assert.equal(norms.rows.length, 1);
    assert.equal(norms.rows[0].dominantModality, 'smell');
  } finally {
    await server.stop();
  }
});

test('a sync retried after a dropped connection does not double-count', async () => {
  const server = await startTestServer();
  try {
    const store = createMemoryStore();
    const client = createOfflineClient({ store, endpoint: server.base, token: 'test-token' });
    await client.enqueueRating({ clientId: 'fixed-id', languageCode: 'jhi', conceptId: 'SMOKE', word: 'cŋɛs', ratings: { smell: 5 } });

    await client.sync();
    // Simulate the same record being re-queued and synced again.
    await store.add({ kind: 'rating', clientId: 'fixed-id', languageCode: 'jhi', conceptId: 'SMOKE', word: 'cŋɛs', ratings: { smell: 5 }, participantRef: null });
    const second = await client.sync();
    assert.equal(second.inserted, 0);
    assert.equal(second.duplicates, 1);
  } finally {
    await server.stop();
  }
});

test('invalid field input is caught locally before it can be queued', async () => {
  const store = createMemoryStore();
  const client = createOfflineClient({ store, endpoint: 'http://unused', token: 't' });
  await assert.rejects(
    () => client.enqueueRating({ languageCode: 'jhi', conceptId: 'SMOKE', word: 'x', ratings: { smell: 99 } }),
    /Validation failed/,
  );
  assert.equal((await client.pending()).length, 0);
});

test('a queue larger than one batch syncs in slices instead of deadlocking', async () => {
  // A field device accumulates far more than one batch between connections.
  // Sending the whole queue at once was rejected on size and then retried at the
  // same size for ever, so the queue could never drain. The client now slices to
  // the size the server validator accepts.
  const store = createMemoryStore();
  const seen = [];
  const client = createOfflineClient({
    store,
    endpoint: 'http://atlas.test',
    token: 'field-token',
    async fetchImpl(url, options) {
      const body = JSON.parse(options.body);
      try {
        validateSyncBatch(body);
      } catch (error) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ issues: error.issues }),
        };
      }
      seen.push(body.records.length);
      return {
        ok: true,
        status: 200,
        json: async () => ({ received: body.records.length, inserted: body.records.length, duplicates: 0 }),
      };
    },
  });

  const queued = MAX_SYNC_BATCH + 1;
  for (let i = 0; i < queued; i += 1) {
    await client.enqueueRating({
      clientId: `bulk-${i}`,
      languageCode: 'tst',
      conceptId: `C${i}`,
      word: `w${i}`,
      ratings: { vision: 3 },
    });
  }

  const result = await client.sync();
  assert.equal(result.received, queued);
  assert.equal(result.batches, 2);
  assert.deepEqual(seen, [MAX_SYNC_BATCH, 1]);
  assert.equal((await client.pending()).length, 0);
});

test('an interrupted sync keeps the batches already confirmed', async () => {
  // The second batch fails, so its records must stay queued while the first
  // batch's records, which the server confirmed, must not be sent again.
  const store = createMemoryStore();
  let calls = 0;
  const client = createOfflineClient({
    store,
    endpoint: 'http://atlas.test',
    token: 'field-token',
    async fetchImpl(url, options) {
      calls += 1;
      const body = JSON.parse(options.body);
      if (calls === 2) return { ok: false, status: 503, json: async () => ({ error: 'unavailable' }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ received: body.records.length, inserted: body.records.length, duplicates: 0 }),
      };
    },
  });

  for (let i = 0; i < MAX_SYNC_BATCH + 5; i += 1) {
    await client.enqueueRating({
      clientId: `part-${i}`,
      languageCode: 'tst',
      conceptId: `C${i}`,
      word: `w${i}`,
      ratings: { vision: 2 },
    });
  }

  await assert.rejects(() => client.sync(), /503/);
  // The confirmed batch is gone; only the unconfirmed remainder is left.
  assert.equal((await client.pending()).length, 5);
});
