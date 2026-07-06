// Configuration is driven entirely by the environment so that no secret is ever
// committed to the repository. Defaults are safe for local development and are
// deliberately strict about anything that would weaken a deployment.

import process from 'node:process';

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  const environment = env.NODE_ENV || 'development';
  const writeTokens = parseList(env.SENSELEX_API_TOKENS);

  // Write endpoints require a bearer token. In production a missing token list
  // is a hard error rather than an open door.
  if (environment === 'production' && writeTokens.length === 0) {
    throw new Error('SENSELEX_API_TOKENS must be set in production so that write endpoints are protected.');
  }

  return {
    environment,
    port: parseInteger(env.PORT, 8787),
    host: env.SENSELEX_HOST || '127.0.0.1',
    databasePath: env.SENSELEX_DATABASE_PATH || './data/senselex.db',
    // Tokens that may write. They are hashed before comparison (see auth.js).
    writeTokens,
    // An empty allow list means same-origin only, which is the safe default.
    corsOrigins: parseList(env.SENSELEX_CORS_ORIGINS),
    // 1 MB comfortably holds a full 1000-record sync batch while capping the memory any one request can claim.
    maxBodyBytes: parseInteger(env.SENSELEX_MAX_BODY_BYTES, 1_000_000),
    // 240 requests a minute, about four a second, is ample for a human-driven rating interface and its batch sync while throttling scripted abuse.
    rateLimit: {
      windowMs: parseInteger(env.SENSELEX_RATE_WINDOW_MS, 60_000),
      max: parseInteger(env.SENSELEX_RATE_MAX, 240),
    },
    // A 200-row page bounds the size of any single JSON response and of the CSV export.
    maxPageSize: parseInteger(env.SENSELEX_MAX_PAGE_SIZE, 200),
  };
}
