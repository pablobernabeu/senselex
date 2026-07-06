// The HTTP application. It is built on Node's own http module with no web
// framework, which keeps the dependency surface at zero and makes every piece of
// request handling explicit. Routing is a small table of method-and-path matchers
// dispatched in order.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openDatabase } from '../db/connection.js';
import { createRepository } from '../db/repository.js';
import { createAuthenticator, hashIp } from './auth.js';
import {
  securityHeaders,
  applyCors,
  readJsonBody,
  createRateLimiter,
  clientAddress,
} from './middleware.js';
import { ValidationError, validateRating, validateResponse, validateSyncBatch } from '../domain/validation.js';
import { DomainError } from '../domain/errors.js';
import { ALL_DIMENSIONS } from '../domain/dimensions.js';
import { toSensorimotorCsv, datasetMetadata } from './export.js';

const here = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(here, '../web');

const STATIC_FILES = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
};

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function sendError(res, status, message, detail) {
  sendJson(res, status, { error: message, detail });
}

function pageParams(url, maxPageSize) {
  return {
    limit: url.searchParams.get('limit'),
    offset: url.searchParams.get('offset'),
    maxPageSize,
  };
}

export function buildApp(config) {
  const db = openDatabase(config.databasePath);
  const repo = createRepository(db);
  const auth = createAuthenticator(config.writeTokens);
  const rateLimiter = createRateLimiter(config.rateLimit);

  // Guards a write handler: enforces auth (when tokens are configured) and writes
  // an audit entry for every attempt, successful or not.
  function authorise(req, res, route) {
    if (!auth.configured) {
      // Development mode with no tokens set. Allowed, but recorded.
      repo.recordAudit({ action: 'write', route, status: 0, detail: 'unauthenticated-dev' });
      return { ok: true, tokenId: null };
    }
    const result = auth.verify(req.headers.authorization);
    if (!result.ok) {
      repo.recordAudit({
        action: 'write',
        route,
        ipHash: hashIp(clientAddress(req)),
        status: 401,
        detail: 'auth-failed',
      });
      sendError(res, 401, 'Authentication required');
      return { ok: false };
    }
    return result;
  }

  async function handleWrite(req, res, route, validate, persist) {
    const authResult = authorise(req, res, route);
    if (!authResult.ok) return;
    let body;
    try {
      body = await readJsonBody(req, config.maxBodyBytes);
    } catch (error) {
      sendError(res, error.statusCode || 400, error.message);
      return;
    }
    let value;
    try {
      value = validate(body);
    } catch (error) {
      if (error instanceof ValidationError) {
        sendError(res, 422, 'Validation failed', error.issues);
        return;
      }
      throw error;
    }
    let outcome;
    try {
      outcome = persist(value);
    } catch (error) {
      if (error instanceof DomainError) {
        repo.recordAudit({
          action: 'write',
          route,
          tokenId: authResult.tokenId,
          ipHash: hashIp(clientAddress(req)),
          status: error.statusCode,
          detail: error.message,
        });
        sendError(res, error.statusCode, error.message, error.detail);
        return;
      }
      throw error;
    }
    repo.recordAudit({
      action: 'write',
      route,
      tokenId: authResult.tokenId,
      ipHash: hashIp(clientAddress(req)),
      status: 200,
    });
    sendJson(res, 200, { ok: true, ...outcome });
  }

  function serveStatic(pathname, res) {
    const entry = STATIC_FILES[pathname];
    if (!entry) return false;
    try {
      const content = readFileSync(resolve(WEB_DIR, entry.file));
      securityHeaders(res);
      res.writeHead(200, { 'Content-Type': entry.type, 'Content-Length': content.length });
      res.end(content);
    } catch {
      sendError(res, 404, 'Not found');
    }
    return true;
  }

  async function handler(req, res) {
    securityHeaders(res);
    applyCors(req, res, config.corsOrigins);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const rate = rateLimiter.check(clientAddress(req));
    if (!rate.allowed) {
      sendError(res, 429, 'Too many requests', { retryAfter: rate.retryAfter });
      return;
    }

    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      sendError(res, 400, 'Bad request');
      return;
    }
    const { pathname } = url;

    try {
      // Static front end.
      if (req.method === 'GET' && serveStatic(pathname, res)) return;

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, 200, { status: 'ok', summary: repo.summary() });
        return;
      }

      // Languages.
      if (req.method === 'GET' && pathname === '/v1/languages') {
        sendJson(res, 200, repo.listLanguages(pageParams(url, config.maxPageSize)));
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/v1/languages/')) {
        const code = decodeURIComponent(pathname.slice('/v1/languages/'.length));
        const language = repo.getLanguage(code);
        if (!language) { sendError(res, 404, 'Unknown language'); return; }
        sendJson(res, 200, language);
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/languages') {
        await handleWrite(req, res, pathname, (body) => body, (body) => {
          repo.upsertLanguage(body);
          return { code: body.code };
        });
        return;
      }

      // Concepts.
      if (req.method === 'GET' && pathname === '/v1/concepts') {
        sendJson(res, 200, repo.listConcepts(pageParams(url, config.maxPageSize)));
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/concepts') {
        await handleWrite(req, res, pathname, (body) => body, (body) => {
          repo.upsertConcept(body);
          return { id: body.id };
        });
        return;
      }

      // Data submission.
      if (req.method === 'POST' && pathname === '/v1/ratings') {
        await handleWrite(req, res, pathname, validateRating, (value) => ({ stored: repo.insertRating(value) }));
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/responses') {
        await handleWrite(req, res, pathname, validateResponse, (value) => ({ stored: repo.insertResponse(value) }));
        return;
      }
      if (req.method === 'POST' && pathname === '/v1/sync') {
        await handleWrite(req, res, pathname, validateSyncBatch, (records) => repo.applySyncBatch(records));
        return;
      }

      // Norms.
      if (req.method === 'GET' && pathname === '/v1/norms/sensorimotor') {
        const language = url.searchParams.get('language');
        if (!language) { sendError(res, 400, 'language query parameter is required'); return; }
        sendJson(res, 200, repo.sensorimotorNorms(language, pageParams(url, config.maxPageSize)), {
          'Cache-Control': 'public, max-age=60',
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/norms/codability') {
        const language = url.searchParams.get('language');
        if (!language) { sendError(res, 400, 'language query parameter is required'); return; }
        sendJson(res, 200, repo.codabilityNorms(language, pageParams(url, config.maxPageSize)), {
          'Cache-Control': 'public, max-age=60',
        });
        return;
      }

      // FAIR export.
      if (req.method === 'GET' && pathname === '/v1/export/sensorimotor.csv') {
        const language = url.searchParams.get('language');
        if (!language) { sendError(res, 400, 'language query parameter is required'); return; }
        const all = repo.sensorimotorNorms(language, { limit: config.maxPageSize, offset: 0, maxPageSize: config.maxPageSize });
        const csv = toSensorimotorCsv(all.rows, ALL_DIMENSIONS);
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="senselex-sensorimotor-${language}.csv"`,
        });
        res.end(csv);
        return;
      }
      if (req.method === 'GET' && pathname === '/v1/export/metadata.json') {
        const language = url.searchParams.get('language');
        if (!language) { sendError(res, 400, 'language query parameter is required'); return; }
        sendJson(res, 200, datasetMetadata(repo.getLanguage(language) || { code: language }, ALL_DIMENSIONS));
        return;
      }

      sendError(res, 404, 'Not found');
    } catch (error) {
      // Never leak internals. Log server-side, return a generic message.
      repo.recordAudit({ action: 'error', route: pathname, status: 500, detail: error.message });
      if (config.environment !== 'production') {
        // eslint-disable-next-line no-console
        console.error(error);
      }
      sendError(res, 500, 'Internal server error');
    }
  }

  return {
    handler,
    repo,
    db,
    close() {
      db.close();
    },
  };
}

export function createServer(config) {
  const app = buildApp(config);
  const server = http.createServer(app.handler);
  return { server, ...app };
}
