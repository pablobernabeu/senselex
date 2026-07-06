import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server/app.js';

// Starts the application on an ephemeral port with an in-memory database, so each
// test runs against a clean, isolated instance with no files left behind.
export async function startTestServer(overrides = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SENSELEX_DATABASE_PATH: ':memory:',
    SENSELEX_API_TOKENS: 'test-token',
    ...overrides,
  });
  const app = createServer(config);
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;

  // Provision the reference data the tests write against, mirroring how a real
  // deployment ships languages and concepts before any measurement is collected.
  if (overrides.seedRefs !== false) {
    app.repo.upsertLanguage({ code: 'tst', name: 'Testish', script: 'Latin', orthographicDepth: 'deep' });
    app.repo.upsertLanguage({ code: 'jhi', name: 'Jahai', script: 'Latin', orthographicDepth: 'shallow' });
    for (const id of ['COFFEE', 'SMOKE', 'THUNDER', 'LEMON', 'SOFT']) {
      app.repo.upsertConcept({ id, gloss: id.toLowerCase() });
    }
  }

  return {
    base: `http://127.0.0.1:${port}`,
    repo: app.repo,
    async stop() {
      await new Promise((resolve) => app.server.close(resolve));
      app.close();
    },
  };
}

export const AUTH = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };
