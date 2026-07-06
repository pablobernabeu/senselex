import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startTestServer } from './helpers.js';
import { createOfflineClient, createMemoryStore } from '../src/offline/client.js';

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
