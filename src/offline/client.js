// The offline-first client. In the field there is often no connection, so the
// elicitation app records to a local queue and synchronises later. The queue is
// behind a small storage interface, so the same logic runs against a file in the
// desktop app and against IndexedDB in the browser. Records carry a
// client-generated id, which the server treats as the primary key, so a sync that
// is retried after a dropped connection cannot create duplicates.

import { validateRating, validateResponse } from '../domain/validation.js';
import { MAX_SYNC_BATCH } from '../domain/dimensions.js';

// Identifiers must be generated in both Node and a bare browser, and the two
// expose the same generator in different places. Web Crypto is standard in both
// from Node 19 onwards, so it is preferred, and the import of node:crypto that
// a browser cannot resolve is avoided.
function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  throw new Error('No crypto.randomUUID available; supply clientId explicitly.');
}

// A minimal in-memory store, used for tests and as the reference implementation
// of the storage interface. A real desktop build supplies a file-backed store
// and the browser build supplies an IndexedDB store with the same three methods.
// Records are stored in the same flat shape the sync endpoint expects, namely a
// kind alongside the validated fields.
export function createMemoryStore() {
  let queue = [];
  return {
    async all() {
      return queue.slice();
    },
    async add(record) {
      queue.push(record);
    },
    async remove(ids) {
      const set = new Set(ids);
      queue = queue.filter((record) => !set.has(record.clientId));
    },
  };
}

export function createOfflineClient({ store, endpoint, token, fetchImpl = globalThis.fetch }) {
  // These are async so that a validation failure becomes a rejected promise
  // rather than a synchronous throw, which keeps the caller's error handling
  // uniform whether validation runs locally or on the server.
  async function enqueueRating(rating) {
    const data = validateRating({ clientId: rating.clientId || newId(), ...rating });
    return store.add({ kind: 'rating', ...data });
  }
  async function enqueueResponse(response) {
    const data = validateResponse({ clientId: response.clientId || newId(), ...response });
    return store.add({ kind: 'response', ...data });
  }

  async function pending() {
    return store.all();
  }

  async function sendBatch(records) {
    const response = await fetchImpl(`${endpoint}/v1/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ records }),
    });
    if (!response.ok) {
      const detail = await safeJson(response);
      throw Object.assign(new Error(`Sync failed with status ${response.status}`), { status: response.status, detail });
    }
    return response.json();
  }

  // Push the queue to the server, in slices no larger than the server accepts.
  // A field device can accumulate far more than one batch between connections,
  // and sending the whole queue at once would be rejected on size and then
  // retried at the same size for ever, so the queue is sliced. Each slice is
  // cleared as soon as the server confirms it, which means an interruption
  // partway through keeps the progress already acknowledged and leaves the rest
  // queued. Records carry client-generated ids, so a slice that was committed
  // but whose response was lost is recognised as a duplicate on retry rather
  // than stored twice.
  async function sync() {
    const records = await store.all();
    if (records.length === 0) return { received: 0, inserted: 0, duplicates: 0, batches: 0 };

    const totals = { received: 0, inserted: 0, duplicates: 0, batches: 0 };
    for (let start = 0; start < records.length; start += MAX_SYNC_BATCH) {
      const slice = records.slice(start, start + MAX_SYNC_BATCH);
      const result = await sendBatch(slice);
      await store.remove(slice.map((record) => record.clientId));
      totals.received += result.received ?? slice.length;
      totals.inserted += result.inserted ?? 0;
      totals.duplicates += result.duplicates ?? 0;
      totals.batches += 1;
    }
    return totals;
  }

  return { enqueueRating, enqueueResponse, pending, sync };
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
