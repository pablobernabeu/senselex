-- SenseLex schema. SQLite is used for the prototype because it ships with Node
-- and needs no separate server, which suits a field laptop. The same schema maps
-- onto PostgreSQL for a scaled deployment; only the column types and the upsert
-- syntax change, both of which are isolated in the repository layer.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS languages (
  code               TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  script             TEXT NOT NULL,
  orthographic_depth TEXT,                       -- shallow | intermediate | deep | non_alphabetic
  direction          TEXT NOT NULL DEFAULT 'ltr',-- ltr | rtl
  concepticon_ok     INTEGER NOT NULL DEFAULT 1,
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS concepts (
  id            TEXT PRIMARY KEY,                -- stable concept identifier
  gloss         TEXT NOT NULL,
  concepticon_id TEXT,                           -- link to the Concepticon catalogue
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Participants are pseudonymous. Only a hashed reference and coarse,
-- non-identifying study variables are stored. No names, contact details, or
-- free-text that could identify a child are ever persisted here.
CREATE TABLE IF NOT EXISTS participants (
  ref           TEXT PRIMARY KEY,
  language_code TEXT REFERENCES languages(code),
  age_band      TEXT,
  group_label   TEXT,                            -- e.g. typical | dyslexia | dld
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Each rating row is one participant's sensorimotor strength vector for one word.
-- The primary key is the client-generated id, which makes re-synced batches
-- idempotent: a repeated insert is ignored rather than duplicated.
CREATE TABLE IF NOT EXISTS ratings (
  id             TEXT PRIMARY KEY,
  language_code  TEXT NOT NULL REFERENCES languages(code),
  concept_id     TEXT NOT NULL REFERENCES concepts(id),
  word           TEXT NOT NULL,
  participant_ref TEXT REFERENCES participants(ref),
  touch          REAL,
  hearing        REAL,
  smell          REAL,
  taste          REAL,
  vision         REAL,
  interoception  REAL,
  mouth_throat   REAL,
  hand_arm       REAL,
  foot_leg       REAL,
  head           REAL,
  torso          REAL,
  source         TEXT NOT NULL DEFAULT 'web',     -- web | field | import
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Each response row is one free-naming response for one stimulus, coded for type
-- and length so that codability can be computed.
CREATE TABLE IF NOT EXISTS responses (
  id             TEXT PRIMARY KEY,
  language_code  TEXT NOT NULL REFERENCES languages(code),
  concept_id     TEXT NOT NULL REFERENCES concepts(id),
  name           TEXT NOT NULL,
  response_type  TEXT NOT NULL,                   -- abstract | source_based | evaluative
  length         INTEGER NOT NULL DEFAULT 0,
  participant_ref TEXT REFERENCES participants(ref),
  source         TEXT NOT NULL DEFAULT 'web',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- A tamper-evident record of every write, kept separate from the data so that
-- governance questions can be answered without touching participant records.
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  action    TEXT NOT NULL,
  route     TEXT NOT NULL,
  token_id  TEXT,
  ip_hash   TEXT,
  status    INTEGER NOT NULL,
  detail    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ratings_lang_concept ON ratings(language_code, concept_id);
CREATE INDEX IF NOT EXISTS idx_ratings_lang_word    ON ratings(language_code, word);
CREATE INDEX IF NOT EXISTS idx_responses_lang_concept ON responses(language_code, concept_id);
CREATE INDEX IF NOT EXISTS idx_participants_lang     ON participants(language_code);
CREATE INDEX IF NOT EXISTS idx_audit_ts             ON audit_log(ts);
