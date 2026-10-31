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
  const { server, auth } = createServer(config);
  server.listen(config.port, config.host, () => {
    const where = `http://${config.host}:${config.port}`;
    process.stdout.write(`SenseLex Atlas listening on ${where}\n`);
    if (config.writeTokens.length === 0 && config.adminTokens.length === 0) {
      process.stdout.write('Warning: no write tokens configured; write endpoints are open. Set SENSELEX_API_TOKENS before any real use.\n');
    }
    // Without admin tokens, every write token, a study link's included, can
    // overwrite languages and concepts. A production server says so once.
    if (config.environment === 'production' && config.adminTokens.length === 0) {
      process.stderr.write('Warning: SENSELEX_ADMIN_TOKENS is not set, so any write token can change languages and concepts. Set SENSELEX_ADMIN_TOKENS to restrict POST /v1/languages and POST /v1/concepts to admin tokens.\n');
    }
    // A token in both lists is an admin token, so a study link must not carry
    // it. A production server names such tokens by their audit-log ids, never
    // the tokens themselves, and says more when no other write token is left.
    if (config.environment === 'production' && auth.sharedTokenIds.length > 0) {
      const ids = `Token ids listed in both: ${auth.sharedTokenIds.join(', ')}.`;
      process.stderr.write(auth.writeOnlyConfigured
        ? `Warning: a token listed in both SENSELEX_API_TOKENS and SENSELEX_ADMIN_TOKENS acts as an admin token and can change languages and concepts, so keep it out of study links. ${ids}\n`
        : `Warning: every token in SENSELEX_API_TOKENS is also in SENSELEX_ADMIN_TOKENS, so no token can go in a study link without being able to change languages and concepts. Add a write token that is not in SENSELEX_ADMIN_TOKENS and use it in study links. ${ids}\n`);
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
