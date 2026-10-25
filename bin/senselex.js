#!/usr/bin/env node
// Command-line entry point. Two subcommands keep the prototype easy to run:
// "serve" (the default) starts the Atlas web service, and "seed" loads the
// demonstration data, which includes invented ratings and naming responses that
// enter the norms like real data.

import process from 'node:process';
import { loadConfig } from '../src/config.js';
import { buildApp, createServer } from '../src/server/app.js';
import { seed } from '../src/db/seed.js';

const command = process.argv[2] || 'serve';

if (command === 'serve') {
  const config = loadConfig();
  const { server } = createServer(config);
  server.listen(config.port, config.host, () => {
    const where = `http://${config.host}:${config.port}`;
    process.stdout.write(`SenseLex Atlas listening on ${where}\n`);
    if (config.writeTokens.length === 0) {
      process.stdout.write('Warning: no write tokens configured; write endpoints are open. Set SENSELEX_API_TOKENS before any real use.\n');
    }
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} else if (command === 'seed') {
  const config = loadConfig();
  const app = buildApp(config);
  const result = seed(app.repo);
  app.close();
  process.stdout.write(`Seeded ${JSON.stringify(result)}\n`);
} else {
  process.stderr.write(`Unknown command: ${command}\nUsage: senselex [serve|seed]\n`);
  process.exit(1);
}
