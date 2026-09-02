// A small, dependency-free schema validator. Validation is centralised so that
// every write endpoint rejects malformed or hostile input before it reaches the
// database, and so that the offline client can validate locally before queuing.

import {
  ALL_DIMENSIONS,
  RATING_MIN,
  RATING_MAX,
  RESPONSE_TYPES,
  MAX_SYNC_BATCH,
} from './dimensions.js';

export class ValidationError extends Error {
  constructor(issues) {
    super('Validation failed');
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// A conservative pattern for client-supplied identifiers: letters and digits in
// any script, plus _.:- as separators. Concept identifiers arrive from
// multilingual clients and legitimately carry non-Latin letters (the browser
// edition derives ACCIÓN from acción rather than mangling it to ACCI_N), so
// the class is Unicode-aware; it still excludes whitespace, quoting, path and
// control characters, every value is bound as a SQL parameter rather than
// concatenated, and nothing but ASCII language codes ever reaches a filename.
const IDENTIFIER = /^[\p{L}\p{N}_.:-]{1,128}$/u;

export function isIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER.test(value);
}

function requireString(object, field, issues, { max = 2000 } = {}) {
  const value = object[field];
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(`${field} is required and must be a non-empty string`);
    return undefined;
  }
  if (value.length > max) {
    issues.push(`${field} must be at most ${max} characters`);
    return undefined;
  }
  return value;
}

function requireIdentifier(object, field, issues) {
  const value = object[field];
  if (!isIdentifier(value)) {
    issues.push(`${field} must match ${IDENTIFIER}`);
    return undefined;
  }
  return value;
}

export function validateRating(input) {
  const issues = [];
  if (!isPlainObject(input)) throw new ValidationError(['body must be an object']);

  const clientId = requireIdentifier(input, 'clientId', issues);
  const languageCode = requireIdentifier(input, 'languageCode', issues);
  const conceptId = requireIdentifier(input, 'conceptId', issues);
  const word = requireString(input, 'word', issues, { max: 512 });
  const participantRef = input.participantRef === undefined || input.participantRef === null
    ? null
    : requireIdentifier(input, 'participantRef', issues);

  const ratings = {};
  if (!isPlainObject(input.ratings)) {
    issues.push('ratings must be an object keyed by dimension');
  } else {
    for (const dimension of ALL_DIMENSIONS) {
      const value = input.ratings[dimension];
      if (value === undefined || value === null) continue; // partial vectors allowed
      if (typeof value !== 'number' || !Number.isFinite(value) || value < RATING_MIN || value > RATING_MAX) {
        issues.push(`ratings.${dimension} must be a number between ${RATING_MIN} and ${RATING_MAX}`);
      } else {
        ratings[dimension] = value;
      }
    }
    const unknown = Object.keys(input.ratings).filter((key) => !ALL_DIMENSIONS.includes(key));
    if (unknown.length > 0) issues.push(`unknown rating dimensions: ${unknown.join(', ')}`);
    if (Object.keys(ratings).length === 0) issues.push('at least one rating dimension is required');
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { clientId, languageCode, conceptId, word, participantRef, ratings };
}

export function validateResponse(input) {
  const issues = [];
  if (!isPlainObject(input)) throw new ValidationError(['body must be an object']);

  const clientId = requireIdentifier(input, 'clientId', issues);
  const languageCode = requireIdentifier(input, 'languageCode', issues);
  const conceptId = requireIdentifier(input, 'conceptId', issues);
  const name = requireString(input, 'name', issues, { max: 512 });
  const participantRef = input.participantRef === undefined || input.participantRef === null
    ? null
    : requireIdentifier(input, 'participantRef', issues);

  let responseType = input.responseType;
  if (!RESPONSE_TYPES.includes(responseType)) {
    issues.push(`responseType must be one of ${RESPONSE_TYPES.join(', ')}`);
    responseType = undefined;
  }

  let length = input.length;
  if (length === undefined || length === null) {
    // Derive an utterance length from the name when the client does not supply one.
    length = name ? name.trim().split(/\s+/).filter(Boolean).length : 0;
  } else if (typeof length !== 'number' || !Number.isInteger(length) || length < 0 || length > 100) {
    issues.push('length must be an integer between 0 and 100');
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { clientId, languageCode, conceptId, name, responseType, length, participantRef };
}

// Reference data is written by the same authenticated routes as measurements and
// deserves the same treatment. The concept catalogue in particular is what every
// rating keys on, so an unchecked identifier here would propagate into the
// ratings table, the export filenames and the norms output.
// Script is left as free text rather than a closed list, because ISO 15924 codes
// and ordinary script names are both in circulation and rejecting either would
// block legitimate entries.
const DIRECTIONS = Object.freeze(['ltr', 'rtl']);
const ORTHOGRAPHIC_DEPTHS = Object.freeze(['shallow', 'intermediate', 'deep', 'non_alphabetic']);

export function validateLanguage(input) {
  const issues = [];
  if (!isPlainObject(input)) throw new ValidationError(['body must be an object']);

  const code = requireIdentifier(input, 'code', issues);
  const name = requireString(input, 'name', issues, { max: 200 });
  const script = requireString(input, 'script', issues, { max: 100 });

  const direction = input.direction === undefined || input.direction === null ? 'ltr' : input.direction;
  if (!DIRECTIONS.includes(direction)) {
    issues.push(`direction must be one of ${DIRECTIONS.join(', ')}`);
  }

  let orthographicDepth = input.orthographicDepth;
  if (orthographicDepth === undefined || orthographicDepth === null) {
    orthographicDepth = null;
  } else if (!ORTHOGRAPHIC_DEPTHS.includes(orthographicDepth)) {
    issues.push(`orthographicDepth must be one of ${ORTHOGRAPHIC_DEPTHS.join(', ')}`);
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { code, name, script, direction, orthographicDepth, concepticonOk: input.concepticonOk !== false };
}

export function validateConcept(input) {
  const issues = [];
  if (!isPlainObject(input)) throw new ValidationError(['body must be an object']);

  const id = requireIdentifier(input, 'id', issues);
  const gloss = requireString(input, 'gloss', issues, { max: 500 });

  // The Concepticon catalogue numbers its concept sets, so an id that is present
  // must at least look like one. Nothing resolves it against the catalogue, so
  // this checks shape only, and the field stays optional.
  let concepticonId = input.concepticonId;
  if (concepticonId === undefined || concepticonId === null || concepticonId === '') {
    concepticonId = null;
  } else if (!/^[0-9]{1,6}$/.test(String(concepticonId))) {
    issues.push('concepticonId must be a Concepticon concept-set number, or omitted');
  } else {
    concepticonId = String(concepticonId);
  }

  if (issues.length > 0) throw new ValidationError(issues);
  return { id, gloss, concepticonId };
}

// A sync batch is an array of typed records. Each record is validated by the
// matching validator, and the whole batch is rejected if any record is invalid,
// so a partial, inconsistent sync can never be committed.
export function validateSyncBatch(input) {
  if (!isPlainObject(input) || !Array.isArray(input.records)) {
    throw new ValidationError(['body must be an object with a records array']);
  }
  // Cap the batch so one sync stays within maxBodyBytes and commits as a single
  // transaction. The offline client slices its queue to the same constant, so a
  // queue larger than one batch syncs in several requests rather than being
  // rejected outright.
  if (input.records.length > MAX_SYNC_BATCH) {
    throw new ValidationError([`a sync batch may contain at most ${MAX_SYNC_BATCH} records`]);
  }
  const validated = [];
  const issues = [];
  input.records.forEach((record, index) => {
    try {
      if (record?.kind === 'rating') {
        validated.push({ kind: 'rating', data: validateRating(record) });
      } else if (record?.kind === 'response') {
        validated.push({ kind: 'response', data: validateResponse(record) });
      } else {
        issues.push(`records[${index}].kind must be "rating" or "response"`);
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        for (const issue of error.issues) issues.push(`records[${index}]: ${issue}`);
      } else {
        throw error;
      }
    }
  });
  if (issues.length > 0) throw new ValidationError(issues);
  return validated;
}
