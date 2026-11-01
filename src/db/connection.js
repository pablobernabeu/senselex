// Opens a SQLite database through Node's built-in driver and applies the schema.
// Pragmas are set for safe concurrency: write-ahead logging lets readers run
// while a write is in progress, and a busy timeout avoids spurious lock errors
// under load. Foreign keys are enforced rather than advisory.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, 'schema.sql');

export function openDatabase(databasePath) {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  }
  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;'); // wait up to 5000 ms for a lock before erroring
  // Under WAL, NORMAL is much faster than FULL and does not risk corrupting the
  // database, but it is not fully durable: transactions committed since the last
  // WAL sync can roll back after an OS crash or power failure (an application
  // crash loses nothing). Clients drop records once the server confirms them, so
  // nothing re-sends a transaction lost this way. Change this to FULL where that
  // matters.
  db.exec('PRAGMA synchronous = NORMAL;');
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  return db;
}
