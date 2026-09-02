// Electron main-process stub for SenseLex Field.
//
// This is a documented sketch, not a runnable build: Electron is intentionally
// not a dependency of the core prototype. It shows the intended desktop pattern,
// which is to run the Atlas service locally on the loopback interface and to show
// its front end in a desktop window, so that elicitation works fully offline and
// data syncs to the central Atlas when a connection is available.
//
// To run it, add Electron in a separate desktop package and start with that.

// import { app, BrowserWindow } from 'electron';
import { createServer } from '../src/server/app.js';
import { loadConfig } from '../src/config.js';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const LOCAL_PORT = 8799;

// The field build has no operator to set an environment variable, so the token is
// generated once and kept beside the database. It is a local credential guarding
// loopback writes, not a shared secret.
function requireFieldToken() {
  if (process.env.SENSELEX_FIELD_TOKEN) return process.env.SENSELEX_FIELD_TOKEN;
  const tokenPath = resolve('./data/field-token');
  if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim();
  const token = randomBytes(32).toString('hex');
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, token, { mode: 0o600 });
  return token;
}

export function startLocalAtlas() {
  // A field instance writes to a local database file and requires no token,
  // because it is reachable only from this machine over the loopback interface.
  const config = loadConfig({
    NODE_ENV: 'production',
    SENSELEX_HOST: '127.0.0.1',
    PORT: String(LOCAL_PORT),
    SENSELEX_DATABASE_PATH: './data/field.db',
    // A local token still guards writes even on loopback. There is no committed
    // default: a shipped token is a published token, and it would also satisfy
    // the production guard in config.js that exists precisely to stop a
    // deployment starting without one. A field build generates a token on first
    // run and stores it with the database.
    SENSELEX_API_TOKENS: requireFieldToken(),
  });
  const { server } = createServer(config);
  return new Promise((resolve) => {
    server.listen(LOCAL_PORT, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${LOCAL_PORT}` }));
  });
}

// The Electron wiring, shown for reference:
//
// app.whenReady().then(async () => {
//   const { url } = await startLocalAtlas();
//   const window = new BrowserWindow({
//     width: 1100,
//     height: 800,
//     webPreferences: { contextIsolation: true, nodeIntegration: false },
//   });
//   await window.loadURL(url);
// });
