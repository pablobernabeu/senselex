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

const LOCAL_PORT = 8799;

export function startLocalAtlas() {
  // A field instance writes to a local database file and requires no token,
  // because it is reachable only from this machine over the loopback interface.
  const config = loadConfig({
    NODE_ENV: 'production',
    SENSELEX_HOST: '127.0.0.1',
    PORT: String(LOCAL_PORT),
    SENSELEX_DATABASE_PATH: './data/field.db',
    // A local token still guards writes even on loopback.
    SENSELEX_API_TOKENS: process.env.SENSELEX_FIELD_TOKEN || 'local-field-token',
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
