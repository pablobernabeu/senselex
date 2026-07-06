// A small, dependency-free schema validator. Validation is centralised so that
// every write endpoint rejects malformed or hostile input before it reaches the
// database, and so that the offline client can validate locally before queuing.

import {
  ALL_DIMENSIONS,
  RATING_MIN,
  RATING_MAX,
  RESPONSE_TYPES,
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

// A conservative pattern for client-supplied identifiers. Allowing only these
// characters keeps identifiers safe to use in URLs, filenames, and logs, and
// removes a class of injection and traversal risks at the door.
const IDENTIFIER = /^[A-Za-z0-9_.:-]{1,128}$/;

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

// A sync batch is an array of typed records. Each record is validated by the
// matching validator, and the whole batch is rejected if any record is invalid,
// so a partial, inconsistent sync can never be committed.
export function validateSyncBatch(input) {
  if (!isPlainObject(input) || !Array.isArray(input.records)) {
    throw new ValidationError(['body must be an object with a records array']);
  }
  // Cap the batch so one sync stays within maxBodyBytes and a single transaction;
  // the offline client never queues more than this between syncs.
  if (input.records.length > 1000) {
    throw new ValidationError(['a sync batch may contain at most 1000 records']);
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
