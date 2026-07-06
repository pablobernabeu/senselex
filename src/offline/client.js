// The offline-first client. In the field there is often no connection, so the
// elicitation app records to a local queue and synchronises later. The queue is
// behind a small storage interface, so the same logic runs against a file in the
// desktop app and against IndexedDB in the browser. Records carry a
// client-generated id, which the server treats as the primary key, so a sync that
// is retried after a dropped connection cannot create duplicates.

import { randomUUID } from 'node:crypto';
import { validateRating, validateResponse } from '../domain/validation.js';

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
    const data = validateRating({ clientId: rating.clientId || randomUUID(), ...rating });
    return store.add({ kind: 'rating', ...data });
  }
  async function enqueueResponse(response) {
    const data = validateResponse({ clientId: response.clientId || randomUUID(), ...response });
    return store.add({ kind: 'response', ...data });
  }

  async function pending() {
    return store.all();
  }

  // Push everything queued to the server in one batch. On success the queued
  // records are cleared. On failure they stay put for the next attempt, so no
  // data is lost when connectivity is intermittent.
  async function sync() {
    const records = await store.all();
    if (records.length === 0) return { received: 0, inserted: 0, duplicates: 0 };
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
    const result = await response.json();
    await store.remove(records.map((record) => record.clientId));
    return result;
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
