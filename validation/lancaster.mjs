// The two Lancaster Sensorimotor Norms files the validation scripts read, in one
// place: where they are kept, where to fetch them, and the SHA-256 that OSF
// publishes for each. OSF files can be revised in place (the trial-level file was,
// in June 2024), so every script checks the checksum before using a file, and a
// mismatch stops the run before it can produce different numbers under the same
// name.
//
// The files are not redistributed here: they carry their own citation and terms
// (Lynott et al., 2020, https://osf.io/7emr6/). Keep them in SENSELEX_DATA_DIR,
// outside any folder a cloud client synchronises, since the trial file is 1.4 GB.
// The direct storage addresses below are used because the short
// https://osf.io/download/<id>/ links have been seen to return an empty file.

import process from 'node:process';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Directory holding the Lancaster files: SENSELEX_DATA_DIR, else this folder. */
export const DATA_DIR = process.env.SENSELEX_DATA_DIR || here;

/** Local name, OSF name, published SHA-256 and storage address of each file. */
export const LANCASTER_FILES = {
  norms: {
    local: 'lancaster-sensorimotor-norms.csv',
    osfName: 'Lancaster_sensorimotor_norms_for_39707_words.csv',
    sha256: '445d363fb1f9f3e50b86d88e2f46cdc9a22b5dd8a713ce4e7be2a773d57f43c5',
    url: 'https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/5cc2d6441906ec0017056ba8',
  },
  trial: {
    local: 'lancaster-trial-ratings.csv',
    osfName: 'Individual_participant_ratings_all_items_sensorimotor_norms_for_39954_words.UPDATED.csv',
    sha256: '3f418ae3a8234a8377f1a6c4cac1afd7ea3e5bd481705fe407997617d3ee7a65',
    url: 'https://files.de-1.osf.io/v1/resources/rwhs6/providers/osfstorage/667d8a53f112ce02e78a6034',
  },
};

/**
 * Path to a Lancaster file after checking that it exists and matches its
 * published checksum. Exits with the fetch command, or with both digests, if not.
 * @param {'norms' | 'trial'} key
 * @returns {Promise<string>} absolute path
 */
export async function verifiedLancasterPath(key) {
  const spec = LANCASTER_FILES[key];
  const path = resolve(DATA_DIR, spec.local);
  if (!existsSync(path)) {
    process.stderr.write(`Missing ${path}\nFetch it with:\n  curl -L -o "${path}" "${spec.url}"\n`);
    process.exit(1);
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const digest = hash.digest('hex');
  if (digest !== spec.sha256) {
    process.stderr.write(`${path} does not match the published ${spec.osfName}\n  got      ${digest}\n  expected ${spec.sha256}\n`);
    process.exit(1);
  }
  return path;
}

/**
 * Split one CSV line into cells, honouring double-quoted fields and doubled
 * quotes inside them.
 * @param {string} line
 * @returns {string[]}
 */
export function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { cells.push(cur); cur = ''; } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

/**
 * Column positions by name, failing loudly if any expected column is absent, so
 * that a reordered or renamed release cannot be read into the wrong fields.
 * @param {string[]} header
 * @param {string[]} names
 * @returns {Record<string, number>}
 */
export function columnIndex(header, names) {
  const index = Object.fromEntries(header.map((h, i) => [h, i]));
  const missing = names.filter((n) => !(n in index));
  if (missing.length) throw new Error(`Lancaster file lacks the columns ${missing.join(', ')}`);
  return index;
}

/**
 * The published norms file as a header and data rows, each row split into cells.
 * @param {string} path a path returned by verifiedLancasterPath('norms')
 * @returns {{ header: string[], rows: string[][] }}
 */
export function readNormsCsv(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  return { header: parseCsvLine(lines[0]), rows: lines.slice(1).map(parseCsvLine) };
}
