// The repository is the only place that writes SQL. Every statement is prepared
// with bound parameters, so user input is never concatenated into a query and
// injection is structurally impossible. Confining SQL here also means a move to
// PostgreSQL touches this file alone.

import { ALL_DIMENSIONS, PERCEPTUAL_DIMENSIONS } from '../domain/dimensions.js';
import {
  modalityExclusivity,
  dominantModality,
  maximumPerceptualStrength,
  ratedChannelCount,
  codability,
} from '../domain/norms.js';
import { ReferenceIntegrityError } from '../domain/errors.js';

const RATING_COLUMNS = ALL_DIMENSIONS.join(', ');
// Per-dimension unweighted mean over a (concept, word) group. SQL AVG skips NULL
// cells, so partial rating vectors (allowed by validateRating) contribute only to
// the dimensions they filled, and a dimension nobody filled averages to NULL.
// The matching COUNT records how many raters stood behind each mean, which with
// partial vectors can differ between dimensions of the same word.
const AVG_COLUMNS = ALL_DIMENSIONS
  .map((d) => `AVG(${d}) AS ${d}, SUM(${d} IS NOT NULL) AS n_${d}`)
  .join(', ');

// Distinguishes the two constraint failures that a write can hit. A repeated
// primary key is an idempotent duplicate and is harmless; a foreign-key failure
// means the client referred to reference data that does not exist and must be
// reported. Anything else is rethrown unchanged.
function classifyConstraint(error) {
  const message = String(error?.message || '');
  if (/UNIQUE constraint failed|PRIMARY KEY/i.test(message)) return 'duplicate';
  if (/FOREIGN KEY constraint failed/i.test(message)) return 'foreign_key';
  return 'other';
}

export function createRepository(db) {
  const statements = {
    upsertLanguage: db.prepare(`
      INSERT INTO languages (code, name, script, orthographic_depth, direction, concepticon_ok)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        name = excluded.name,
        script = excluded.script,
        orthographic_depth = excluded.orthographic_depth,
        direction = excluded.direction,
        concepticon_ok = excluded.concepticon_ok
    `),
    getLanguage: db.prepare('SELECT * FROM languages WHERE code = ?'),
    listLanguages: db.prepare('SELECT * FROM languages ORDER BY code LIMIT ? OFFSET ?'),
    countLanguages: db.prepare('SELECT COUNT(*) AS n FROM languages'),

    upsertConcept: db.prepare(`
      INSERT INTO concepts (id, gloss, concepticon_id)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET gloss = excluded.gloss, concepticon_id = excluded.concepticon_id
    `),
    listConcepts: db.prepare('SELECT * FROM concepts ORDER BY id LIMIT ? OFFSET ?'),
    countConcepts: db.prepare('SELECT COUNT(*) AS n FROM concepts'),

    upsertParticipant: db.prepare(`
      INSERT INTO participants (ref, language_code, age_band, group_label)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(ref) DO UPDATE SET
        language_code = excluded.language_code,
        age_band = excluded.age_band,
        group_label = excluded.group_label
    `),

    // Measurements carry a pseudonymous participant reference minted by the
    // client, and there is no route by which a client registers a participant
    // first. Without this the foreign key rejected every submission that named a
    // participant, which is every submission in the documented recruitment
    // pipeline, since that locks the reference to the panel's identifier.
    // OR IGNORE leaves an existing row untouched, so a participant who already
    // has recorded study variables does not have them erased by a later batch.
    ensureParticipant: db.prepare(`
      INSERT OR IGNORE INTO participants (ref, language_code) VALUES (?, ?)
    `),

    // A plain insert, so that a duplicate primary key and a foreign-key failure
    // surface as distinct errors rather than being silently ignored. Idempotency
    // is handled in the wrapper by catching the duplicate case.
    insertRating: db.prepare(`
      INSERT INTO ratings
        (id, language_code, concept_id, word, participant_ref, ${RATING_COLUMNS}, source)
      VALUES (?, ?, ?, ?, ?, ${ALL_DIMENSIONS.map(() => '?').join(', ')}, ?)
    `),
    insertResponse: db.prepare(`
      INSERT INTO responses
        (id, language_code, concept_id, name, response_type, length, participant_ref, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),

    aggregateRatings: db.prepare(`
      SELECT concept_id, word, COUNT(*) AS n_records, ${AVG_COLUMNS}
      FROM ratings
      WHERE language_code = ?
      GROUP BY concept_id, word
      ORDER BY concept_id, word
      LIMIT ? OFFSET ?
    `),
    countRatingGroups: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT 1 FROM ratings WHERE language_code = ? GROUP BY concept_id, word
      )
    `),
    responsesForGroup: db.prepare(`
      SELECT name, response_type AS responseType, length
      FROM responses
      WHERE language_code = ? AND concept_id = ?
    `),
    distinctResponseGroups: db.prepare(`
      SELECT concept_id, COUNT(*) AS n
      FROM responses
      WHERE language_code = ?
      GROUP BY concept_id
      ORDER BY concept_id
      LIMIT ? OFFSET ?
    `),
    countResponseGroups: db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT 1 FROM responses WHERE language_code = ? GROUP BY concept_id
      )
    `),

    insertAudit: db.prepare(`
      INSERT INTO audit_log (action, route, token_id, ip_hash, status, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `),

    summary: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM languages) AS languages,
        (SELECT COUNT(*) FROM concepts) AS concepts,
        (SELECT COUNT(*) FROM ratings) AS ratings,
        (SELECT COUNT(*) FROM responses) AS responses
    `),
  };

  function clampPage(limit, offset, maxPageSize) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), maxPageSize);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    return { limit: safeLimit, offset: safeOffset };
  }

  return {
    upsertLanguage(language) {
      statements.upsertLanguage.run(
        language.code,
        language.name,
        language.script,
        language.orthographicDepth ?? null,
        language.direction ?? 'ltr',
        language.concepticonOk === false ? 0 : 1,
      );
    },
    getLanguage(code) {
      return statements.getLanguage.get(code) ?? null;
    },
    listLanguages({ limit, offset, maxPageSize }) {
      const page = clampPage(limit, offset, maxPageSize);
      const rows = statements.listLanguages.all(page.limit, page.offset);
      const total = statements.countLanguages.get().n;
      return { rows, total, ...page };
    },

    upsertConcept(concept) {
      statements.upsertConcept.run(concept.id, concept.gloss, concept.concepticonId ?? null);
    },
    listConcepts({ limit, offset, maxPageSize }) {
      const page = clampPage(limit, offset, maxPageSize);
      const rows = statements.listConcepts.all(page.limit, page.offset);
      const total = statements.countConcepts.get().n;
      return { rows, total, ...page };
    },

    upsertParticipant(participant) {
      statements.upsertParticipant.run(
        participant.ref,
        participant.languageCode ?? null,
        participant.ageBand ?? null,
        participant.groupLabel ?? null,
      );
    },

    // Returns true when a new row was written and false when the client id was
    // already present (an idempotent duplicate). Throws ReferenceIntegrityError
    // when the language or concept does not exist.
    insertRating(rating) {
      if (rating.participantRef) statements.ensureParticipant.run(rating.participantRef, rating.languageCode);
      const params = [
        rating.clientId,
        rating.languageCode,
        rating.conceptId,
        rating.word,
        rating.participantRef ?? null,
        ...ALL_DIMENSIONS.map((d) => (typeof rating.ratings[d] === 'number' ? rating.ratings[d] : null)),
        rating.source ?? 'web',
      ];
      try {
        statements.insertRating.run(...params);
        return true;
      } catch (error) {
        const kind = classifyConstraint(error);
        if (kind === 'duplicate') return false;
        if (kind === 'foreign_key') throw new ReferenceIntegrityError({ languageCode: rating.languageCode, conceptId: rating.conceptId });
        throw error;
      }
    },
    insertResponse(response) {
      if (response.participantRef) statements.ensureParticipant.run(response.participantRef, response.languageCode);
      try {
        statements.insertResponse.run(
          response.clientId,
          response.languageCode,
          response.conceptId,
          response.name,
          response.responseType,
          response.length ?? 0,
          response.participantRef ?? null,
          response.source ?? 'web',
        );
        return true;
      } catch (error) {
        const kind = classifyConstraint(error);
        if (kind === 'duplicate') return false;
        if (kind === 'foreign_key') throw new ReferenceIntegrityError({ languageCode: response.languageCode, conceptId: response.conceptId });
        throw error;
      }
    },

    // Apply a validated sync batch in a single transaction so that the database
    // never holds a half-applied batch.
    applySyncBatch(records) {
      let inserted = 0;
      let duplicates = 0;
      db.exec('BEGIN');
      try {
        for (const record of records) {
          const isNew = record.kind === 'rating'
            ? this.insertRating({ ...record.data, source: 'field' })
            : this.insertResponse({ ...record.data, source: 'field' });
          if (isNew) inserted += 1; else duplicates += 1;
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return { received: records.length, inserted, duplicates };
    },

    sensorimotorNorms(languageCode, { limit, offset, maxPageSize }) {
      const page = clampPage(limit, offset, maxPageSize);
      const rows = statements.aggregateRatings.all(languageCode, page.limit, page.offset);
      const total = statements.countRatingGroups.get(languageCode).n;
      const norms = rows.map((row) => {
        // SQL AVG returns NULL for a dimension no rater filled, and that null is
        // carried through rather than coerced to zero: see the note in
        // domain/norms.js on why an absent judgement is not a zero one.
        const averaged = {};
        const counts = {};
        for (const dimension of ALL_DIMENSIONS) {
          averaged[dimension] = row[dimension] ?? null;
          counts[dimension] = row[`n_${dimension}`] ?? 0;
        }
        const dominant = dominantModality(averaged, PERCEPTUAL_DIMENSIONS);
        return {
          conceptId: row.concept_id,
          word: row.word,
          // Records contributing to this word, which is not the same as the
          // number of raters behind any one dimension once partial vectors are
          // allowed. Per-dimension counts travel in `n`.
          nRecords: row.n_records,
          mean: averaged,
          n: counts,
          dominantModality: dominant.modality,
          maximumPerceptualStrength: maximumPerceptualStrength(averaged),
          modalityExclusivity: modalityExclusivity(averaged),
          perceptualChannels: ratedChannelCount(averaged, PERCEPTUAL_DIMENSIONS),
        };
      });
      return { rows: norms, total, ...page };
    },

    codabilityNorms(languageCode, { limit, offset, maxPageSize }) {
      const page = clampPage(limit, offset, maxPageSize);
      const groups = statements.distinctResponseGroups.all(languageCode, page.limit, page.offset);
      const total = statements.countResponseGroups.get(languageCode).n;
      const norms = groups.map((group) => {
        const responses = statements.responsesForGroup.all(languageCode, group.concept_id);
        return { conceptId: group.concept_id, ...codability(responses) };
      });
      return { rows: norms, total, ...page };
    },

    recordAudit(entry) {
      statements.insertAudit.run(
        entry.action,
        entry.route,
        entry.tokenId ?? null,
        entry.ipHash ?? null,
        entry.status,
        entry.detail ?? null,
      );
    },

    summary() {
      return statements.summary.get();
    },
  };
}
