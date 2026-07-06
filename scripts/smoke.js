// A quick end-to-end check: start an in-memory Atlas, load the seed data, and
// exercise the read paths, printing a short summary. Useful as a manual sanity
// check beyond the automated tests.

import { loadConfig } from '../src/config.js';
import { createServer } from '../src/server/app.js';
import { seed } from '../src/db/seed.js';

const config = loadConfig({ NODE_ENV: 'test', SENSELEX_DATABASE_PATH: ':memory:', SENSELEX_API_TOKENS: 'smoke-token' });
const app = createServer(config);

await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${app.server.address().port}`;

const seeded = seed(app.repo);
process.stdout.write(`seeded: ${JSON.stringify(seeded)}\n`);

const health = await (await fetch(`${base}/health`)).json();
process.stdout.write(`health: ${JSON.stringify(health.summary)}\n`);

const norms = await (await fetch(`${base}/v1/norms/sensorimotor?language=eng`)).json();
process.stdout.write(`english sensorimotor norms: ${norms.rows.length} words\n`);
for (const row of norms.rows) {
  process.stdout.write(`  ${row.word}: dominant=${row.dominantModality} exclusivity=${row.modalityExclusivity.toFixed(2)} (n=${row.n})\n`);
}

const codability = await (await fetch(`${base}/v1/norms/codability?language=jhi`)).json();
process.stdout.write(`jahai codability groups: ${codability.rows.length}\n`);
for (const row of codability.rows) {
  process.stdout.write(`  ${row.conceptId}: agreement=${row.agreement.toFixed(2)} distinctNames=${row.distinctNames} (n=${row.n})\n`);
}

const csv = await (await fetch(`${base}/v1/export/sensorimotor.csv?language=eng`)).text();
process.stdout.write(`csv export bytes: ${csv.length}\n`);

await new Promise((resolve) => app.server.close(resolve));
app.close();
process.stdout.write('smoke ok\n');
