import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { loadConfig } from '../src/config.js';
import { createAuthenticator } from '../src/server/auth.js';
import { startTestServer, runServeBriefly, AUTH, ADMIN_AUTH } from './helpers.js';

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
  // The language and concept routes run their bodies through validators, so a
  // malformed language and a concept id containing markup are refused with 422.
  // The concept catalogue is what every rating keys on, so it gets the same
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

    // A Concepticon identifier that is not a concept-set number is refused,
    // since a wrong link silently joins two unrelated concepts in any later
    // merge. Only the shape is checked: nothing resolves the number against the
    // catalogue, so a well-formed but wrong link is still accepted.
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
  // The export reads the norms page by page until every row is in, so a
  // language with more words than the page size is exported whole, and
  // X-Total-Rows gives the number of rows.
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
  // panel's identifier and sends it with every record. No route registers a
  // participant beforehand, so the server creates the participant row on insert
  // rather than letting the foreign key refuse the batch.
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

test('a new participant with an unknown language is refused with 422', async () => {
  // The participant row refers to the language too, so its foreign key fails
  // before the measurement's does. That failure is reported like any other
  // unknown reference.
  const server = await startTestServer();
  try {
    const rating = { kind: 'rating', clientId: 'lang-r', languageCode: 'zzz', conceptId: 'COFFEE', word: 'coffee', participantRef: 'new-participant-1', ratings: { smell: 4 } };
    const naming = { kind: 'response', clientId: 'lang-s', languageCode: 'zzz', conceptId: 'COFFEE', name: 'bitter', responseType: 'abstract', participantRef: 'new-participant-2' };
    for (const [path, body] of [['/v1/ratings', rating], ['/v1/responses', naming], ['/v1/sync', { records: [rating, naming] }]]) {
      const response = await fetch(`${server.base}${path}`, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
      assert.equal(response.status, 422, path);
      assert.equal((await response.json()).error, 'Unknown language or concept');
    }
  } finally {
    await server.stop();
  }
});

test('a refused measurement stores no participant', async () => {
  // The participant row is written together with the measurement, so a write
  // refused for an unknown concept leaves no participant behind.
  const server = await startTestServer();
  try {
    const rating = { clientId: 'concept-r', languageCode: 'tst', conceptId: 'NOPE', word: 'nope', participantRef: 'new-participant-3', ratings: { smell: 4 } };
    const naming = { clientId: 'concept-s', languageCode: 'tst', conceptId: 'NOPE', name: 'none', responseType: 'abstract', participantRef: 'new-participant-4' };
    for (const [path, body] of [['/v1/ratings', rating], ['/v1/responses', naming]]) {
      const response = await fetch(`${server.base}${path}`, { method: 'POST', headers: AUTH, body: JSON.stringify(body) });
      assert.equal(response.status, 422, path);
      assert.equal((await response.json()).error, 'Unknown language or concept');
    }
    assert.equal(server.db.prepare('SELECT COUNT(*) AS n FROM participants').get().n, 0);
  } finally {
    await server.stop();
  }
});

test('a resent clientId stores no new participant', async () => {
  // A resent measurement is not stored again, so the participant it names is
  // not stored either.
  const server = await startTestServer();
  try {
    const rating = { clientId: 'dup-r', languageCode: 'tst', conceptId: 'COFFEE', word: 'coffee', ratings: { smell: 4 } };
    for (const participantRef of ['first', 'second']) {
      const response = await fetch(`${server.base}/v1/ratings`, { method: 'POST', headers: AUTH, body: JSON.stringify({ ...rating, participantRef }) });
      assert.equal(response.status, 200);
    }
    assert.deepEqual(server.db.prepare('SELECT ref FROM participants ORDER BY ref').all().map((row) => row.ref), ['first']);
  } finally {
    await server.stop();
  }
});

// Admin tokens. SENSELEX_ADMIN_TOKENS restricts the reference-data routes to the
// tokens it lists, and leaves the measurement routes open to write tokens.

// The audit log's 8-character token id, worked out here rather than taken from
// auth.js, so that a change to it there is caught.
function tokenId(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 8);
}

function auditRows(server) {
  return server.db.prepare('SELECT route, token_id AS tokenId, ip_hash AS ipHash, status, detail FROM audit_log ORDER BY id')
    .all()
    .map((row) => ({ ...row }));
}

function post(server, path, body, headers) {
  return fetch(`${server.base}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const NO_AUTH = { 'Content-Type': 'application/json' };

// One write to each reference-data route. Both change an entry that
// startTestServer provides, so a test can tell whether the write took effect.
const REFERENCE_WRITES = [
  ['/v1/languages', { code: 'tst', name: 'Testish (revised)', script: 'Latin' }],
  ['/v1/concepts', { id: 'COFFEE', gloss: 'coffee (revised)' }],
];

// One write to each measurement route. The tag keeps client ids apart, so that
// each call stores new records rather than duplicates.
function measurementWrites(tag) {
  const rating = { clientId: `${tag}-r`, languageCode: 'tst', conceptId: 'COFFEE', word: 'coffee', ratings: { smell: 4 } };
  const naming = { clientId: `${tag}-n`, languageCode: 'tst', conceptId: 'COFFEE', name: 'bitter', responseType: 'abstract' };
  return [
    ['/v1/ratings', rating],
    ['/v1/responses', naming],
    ['/v1/sync', { records: [{ kind: 'rating', ...rating, clientId: `${tag}-sr` }, { kind: 'response', ...naming, clientId: `${tag}-sn` }] }],
  ];
}

function referenceData(server) {
  return {
    language: server.repo.getLanguage('tst').name,
    concept: server.db.prepare("SELECT gloss FROM concepts WHERE id = 'COFFEE'").get().gloss,
  };
}

test('the authenticator tells write tokens from admin tokens', () => {
  const auth = createAuthenticator(['write-1', 'both'], ['admin-1', 'both']);
  assert.equal(auth.configured, true);
  assert.equal(auth.adminConfigured, true);
  assert.deepEqual(auth.verify('Bearer write-1'), { ok: true, tokenId: tokenId('write-1'), admin: false });
  assert.deepEqual(auth.verify('Bearer admin-1'), { ok: true, tokenId: tokenId('admin-1'), admin: true });
  // A token in both lists is an admin token, with the same id as either alone.
  assert.deepEqual(auth.verify('Bearer both'), { ok: true, tokenId: tokenId('both'), admin: true });
  assert.deepEqual(auth.verify('Bearer nope'), { ok: false });
  assert.deepEqual(auth.verify(undefined), { ok: false });

  assert.equal(createAuthenticator(['write-1']).adminConfigured, false);
  assert.equal(createAuthenticator([], ['admin-1']).configured, true);
  assert.equal(createAuthenticator([], []).configured, false);
});

test('SENSELEX_ADMIN_TOKENS is parsed like SENSELEX_API_TOKENS', () => {
  const config = loadConfig({ SENSELEX_API_TOKENS: ' a, b ,,c ', SENSELEX_ADMIN_TOKENS: ' x, y ,,z ' });
  assert.deepEqual(config.writeTokens, ['a', 'b', 'c']);
  assert.deepEqual(config.adminTokens, ['x', 'y', 'z']);
  assert.deepEqual(loadConfig({}).adminTokens, []);
  assert.deepEqual(loadConfig({ SENSELEX_ADMIN_TOKENS: ' , ' }).adminTokens, []);
});

test('in production SENSELEX_API_TOKENS stays required when admin tokens are set', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /^Error: SENSELEX_API_TOKENS must be set in production so that write endpoints are protected\.$/);
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', SENSELEX_ADMIN_TOKENS: 'admin-token' }),
    /SENSELEX_API_TOKENS must be set in production.* SENSELEX_ADMIN_TOKENS does not replace it\./,
  );
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', SENSELEX_API_TOKENS: 'test-token' }));
  assert.doesNotThrow(() => loadConfig({ NODE_ENV: 'production', SENSELEX_API_TOKENS: 'test-token', SENSELEX_ADMIN_TOKENS: 'admin-token' }));
});

test('without admin tokens, a write token still writes languages and concepts', async () => {
  // The restriction is opt-in, so a deployment that does not set
  // SENSELEX_ADMIN_TOKENS, or sets it to nothing but separators, keeps the
  // earlier behaviour.
  for (const overrides of [{}, { SENSELEX_ADMIN_TOKENS: ' , ' }]) {
    const server = await startTestServer(overrides);
    try {
      for (const [path, body] of REFERENCE_WRITES) {
        assert.equal((await post(server, path, body, AUTH)).status, 200, path);
      }
      assert.deepEqual(referenceData(server), { language: 'Testish (revised)', concept: 'coffee (revised)' });
      assert.deepEqual(auditRows(server).map((row) => [row.route, row.status, row.tokenId]), [
        ['/v1/languages', 200, tokenId('test-token')],
        ['/v1/concepts', 200, tokenId('test-token')],
      ]);
    } finally {
      await server.stop();
    }
  }
});

test('with admin tokens, a write token on a reference-data route gets 403 and is audited', async () => {
  const server = await startTestServer({ SENSELEX_ADMIN_TOKENS: 'admin-token', SENSELEX_AUDIT_SECRET: 'audit-key' });
  try {
    for (const [path, body] of REFERENCE_WRITES) {
      const response = await post(server, path, body, AUTH);
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).error, 'This route needs an admin token');
    }
    assert.deepEqual(referenceData(server), { language: 'Testish', concept: 'coffee' });
    const rows = auditRows(server);
    assert.deepEqual(rows.map(({ ipHash, ...row }) => row), [
      { route: '/v1/languages', tokenId: tokenId('test-token'), status: 403, detail: 'admin-required' },
      { route: '/v1/concepts', tokenId: tokenId('test-token'), status: 403, detail: 'admin-required' },
    ]);
    // Like a refused token, the refusal carries the keyed address digest.
    for (const row of rows) assert.match(row.ipHash, /^[0-9a-f]{16}$/);
  } finally {
    await server.stop();
  }
});

test('with admin tokens, an admin token writes languages and concepts', async () => {
  const server = await startTestServer({ SENSELEX_ADMIN_TOKENS: 'admin-token' });
  try {
    for (const [path, body] of REFERENCE_WRITES) {
      assert.equal((await post(server, path, body, ADMIN_AUTH)).status, 200, path);
    }
    assert.deepEqual(referenceData(server), { language: 'Testish (revised)', concept: 'coffee (revised)' });
    assert.deepEqual(auditRows(server).map((row) => [row.route, row.status, row.tokenId]), [
      ['/v1/languages', 200, tokenId('admin-token')],
      ['/v1/concepts', 200, tokenId('admin-token')],
    ]);
  } finally {
    await server.stop();
  }
});

test('with admin tokens, measurement routes take a write token or an admin token', async () => {
  const server = await startTestServer({ SENSELEX_ADMIN_TOKENS: 'admin-token' });
  try {
    const expected = [];
    for (const [tag, headers, token] of [['write', AUTH, 'test-token'], ['admin', ADMIN_AUTH, 'admin-token']]) {
      for (const [path, body] of measurementWrites(tag)) {
        const response = await post(server, path, body, headers);
        assert.equal(response.status, 200, `${path} with the ${tag} token`);
        const result = await response.json();
        assert.ok(result.stored === true || result.inserted === 2, `${path} with the ${tag} token stored nothing`);
        expected.push([path, 200, tokenId(token)]);
      }
    }
    assert.deepEqual(auditRows(server).map((row) => [row.route, row.status, row.tokenId]), expected);
  } finally {
    await server.stop();
  }
});

test('with admin tokens, a missing or unknown token still gets 401 on every write route', async () => {
  // Authentication comes before the admin check, so a reference-data route
  // answers an unknown token with 401 rather than 403.
  const server = await startTestServer({ SENSELEX_ADMIN_TOKENS: 'admin-token' });
  try {
    const writes = [...REFERENCE_WRITES, ...measurementWrites('refused')];
    for (const headers of [NO_AUTH, { ...NO_AUTH, Authorization: 'Bearer not-a-token' }]) {
      for (const [path, body] of writes) {
        const response = await post(server, path, body, headers);
        assert.equal(response.status, 401, path);
        assert.equal((await response.json()).error, 'Authentication required');
      }
    }
    const rows = auditRows(server);
    assert.equal(rows.length, writes.length * 2);
    for (const row of rows) {
      assert.deepEqual([row.status, row.detail, row.tokenId], [401, 'auth-failed', null]);
    }
    assert.deepEqual(referenceData(server), { language: 'Testish', concept: 'coffee' });
  } finally {
    await server.stop();
  }
});

test('a token listed as both a write token and an admin token acts as an admin token', async () => {
  const server = await startTestServer({ SENSELEX_API_TOKENS: 'test-token,both-token', SENSELEX_ADMIN_TOKENS: 'admin-token,both-token' });
  try {
    const headers = { ...NO_AUTH, Authorization: 'Bearer both-token' };
    for (const [path, body] of [...REFERENCE_WRITES, ...measurementWrites('both')]) {
      assert.equal((await post(server, path, body, headers)).status, 200, path);
    }
    assert.deepEqual(referenceData(server), { language: 'Testish (revised)', concept: 'coffee (revised)' });
    assert.ok(auditRows(server).every((row) => row.tokenId === tokenId('both-token')));
  } finally {
    await server.stop();
  }
});

test('with only admin tokens set, every write needs a token', async () => {
  const server = await startTestServer({ SENSELEX_API_TOKENS: '', SENSELEX_ADMIN_TOKENS: 'admin-token' });
  try {
    const [rating] = measurementWrites('only-admin');
    for (const headers of [NO_AUTH, AUTH]) {
      assert.equal((await post(server, ...rating, headers)).status, 401);
      assert.equal((await post(server, ...REFERENCE_WRITES[0], headers)).status, 401);
    }
    assert.equal((await post(server, ...rating, ADMIN_AUTH)).status, 200);
    assert.equal((await post(server, ...REFERENCE_WRITES[0], ADMIN_AUTH)).status, 200);
    assert.ok(auditRows(server).every((row) => row.detail !== 'unauthenticated-dev'));
  } finally {
    await server.stop();
  }
});

test('with no tokens at all, development writes stay open and are recorded', async () => {
  const server = await startTestServer({ SENSELEX_API_TOKENS: '' });
  try {
    const [rating] = measurementWrites('dev');
    assert.equal((await post(server, ...REFERENCE_WRITES[0], NO_AUTH)).status, 200);
    assert.equal((await post(server, ...rating, NO_AUTH)).status, 200);
    const rows = auditRows(server).filter((row) => row.detail === 'unauthenticated-dev');
    assert.deepEqual(rows.map((row) => [row.route, row.status, row.tokenId]), [
      ['/v1/languages', 0, null],
      ['/v1/ratings', 0, null],
    ]);
  } finally {
    await server.stop();
  }
});

test('a production server without admin tokens warns once on stderr', async () => {
  const warningLines = (text) => text.split('\n').filter((line) => line.includes('SENSELEX_ADMIN_TOKENS'));

  const unset = await runServeBriefly({ NODE_ENV: 'production', SENSELEX_API_TOKENS: 'test-token' });
  assert.match(unset.stdout, /listening on/);
  const lines = warningLines(unset.stderr);
  assert.equal(lines.length, 1, unset.stderr);
  assert.match(lines[0], /any write token can change languages and concepts/);
  assert.deepEqual(warningLines(unset.stdout), []);

  const set = await runServeBriefly({ NODE_ENV: 'production', SENSELEX_API_TOKENS: 'test-token', SENSELEX_ADMIN_TOKENS: 'admin-token' });
  assert.match(set.stdout, /listening on/);
  assert.deepEqual(warningLines(set.stderr), []);

  // Development does not warn about admin tokens. It still says when writes are
  // open, which they are not once admin tokens alone are set.
  const development = await runServeBriefly({});
  assert.match(development.stdout, /listening on/);
  assert.deepEqual(warningLines(development.stderr), []);
  assert.match(development.stdout, /write endpoints are open/);

  const adminOnly = await runServeBriefly({ SENSELEX_ADMIN_TOKENS: 'admin-token' });
  assert.match(adminOnly.stdout, /listening on/);
  assert.doesNotMatch(adminOnly.stdout, /write endpoints are open/);
});
