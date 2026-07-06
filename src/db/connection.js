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
  // NORMAL is durable under WAL and much faster than FULL. The only exposure is
  // losing the last transaction on an OS crash, which an idempotent client re-sync restores.
  db.exec('PRAGMA synchronous = NORMAL;');
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  return db;
}
