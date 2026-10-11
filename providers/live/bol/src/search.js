'use strict';

/**
 * Bol.com catalog/search client (FR-079).
 * HTTP injectable for recorded fixtures. Registry enabled true (FR-171).
 * normalize / worker wiring are out of scope for this FR.
 *
 * Shape mirrors other Phase-2 live stubs: GET search with API key header,
 * fixture wrapper `bolProductAPI.products[]`.
 */

class BolCredsError extends Error {
  constructor(message) {
    super(message || 'bol_missing_credentials');
    this.name = 'BolCredsError';
    this.code = 'bol_missing_credentials';
  }
}

const DEFAULT_API_BASE = 'https://api.bol.com';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readBolCreds(env) {
  const e = env || process.env;
  const apiKey =
    e.BOL_API_KEY != null
      ? String(e.BOL_API_KEY).trim()
      : e.BOL_CLIENT_ID != null
        ? String(e.BOL_CLIENT_ID).trim()
        : '';
  const baseUrl =
    e.BOL_API_BASE != null && String(e.BOL_API_BASE).trim()
      ? String(e.BOL_API_BASE).trim().replace(/\/$/, '')
      : DEFAULT_API_BASE;
  return { apiKey, baseUrl };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertBolCreds(env) {
  const c = readBolCreds(env);
  const missing = [];
  if (!c.apiKey) missing.push('BOL_API_KEY');
  if (missing.length) {
    throw new BolCredsError(
      `Bol API credentials missing: ${missing.join(', ')}. Set them in providers/live/bol/.env (never commit).`,
    );
  }
  return c;
}

function keywordsFromMsg(msg) {
  if (msg && typeof msg.q === 'string' && msg.q.trim()) return msg.q.trim();
  if (msg && Array.isArray(msg.searchterms)) {
    const parts = msg.searchterms
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.trim());
    if (parts.length) return parts.join(' ');
  }
  return '';
}

/**
 * Build GET URL for catalog v4 search.
 * @param {{ baseUrl: string }} creds
 * @param {string} query
 * @param {{ limit?: number, offset?: number }} [opts]
 */
function buildCatalogSearchUrl(creds, query, opts) {
  const limit = opts && opts.limit != null ? Number(opts.limit) : 20;
  const offset = opts && opts.offset != null ? Number(opts.offset) : 0;
  const u = new URL(`${creds.baseUrl}/catalog/v4/search`);
  u.searchParams.set('q', query || ' ');
  u.searchParams.set('limit', String(limit > 0 ? limit : 20));
  u.searchParams.set('offset', String(offset >= 0 ? offset : 0));
  u.searchParams.set('format', 'json');
  return u.toString();
}

/**
 * Default Node https GET helper (JSON).
 * @param {{ method: string, url: string, headers?: object, body?: string }} req
 */
async function defaultHttpRequest(req) {
  const https = require('node:https');
  const { URL } = require('node:url');
  const u = new URL(req.url);
  const payload = req.body != null ? String(req.body) : null;
  const headers = Object.assign({}, req.headers || {});
  if (payload != null && headers['Content-Length'] == null) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: req.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try {
            json = text ? JSON.parse(text) : {};
          } catch (err) {
            reject(
              new Error(
                `Bol HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Bol HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
            );
            err.statusCode = res.statusCode;
            err.body = json;
            reject(err);
            return;
          }
          resolve(json);
        });
      },
    );
    r.on('error', reject);
    if (payload != null) r.write(payload);
    r.end();
  });
}

/**
 * Search Bol catalog. Returns the parsed API JSON (not normalized).
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object>}
 */
async function searchBol(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertBolCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg) || ' ';
  const url = buildCatalogSearchUrl(creds, keywords);
  const json = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Accept: 'application/json',
      'X-API-KEY': creds.apiKey,
    },
  });

  return json;
}

module.exports = {
  searchBol,
  assertBolCreds,
  readBolCreds,
  BolCredsError,
  buildCatalogSearchUrl,
  keywordsFromMsg,
  DEFAULT_API_BASE,
};
