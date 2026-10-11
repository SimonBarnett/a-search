'use strict';

/**
 * Kelkoo Shopping API v2 offer search client (FR-063).
 * HTTP injectable for recorded fixtures. Enabled via FR-167; credentials from Secrets Manager (never commit secrets).
 * normalize / worker wiring are out of scope for this FR.
 */

class KelkooCredsError extends Error {
  constructor(message) {
    super(message || 'kelkoo_missing_credentials');
    this.name = 'KelkooCredsError';
    this.code = 'kelkoo_missing_credentials';
  }
}

const DEFAULT_SHOPPING_BASE =
  'https://api.kelkoogroup.net/publisher/shopping/v2';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readKelkooCreds(env) {
  const e = env || process.env;
  const apiKey =
    e.KELKOO_API_KEY != null ? String(e.KELKOO_API_KEY).trim() : '';
  const country =
    e.KELKOO_COUNTRY != null && String(e.KELKOO_COUNTRY).trim()
      ? String(e.KELKOO_COUNTRY).trim().toLowerCase()
      : 'uk';
  const baseUrl =
    e.KELKOO_SHOPPING_BASE != null && String(e.KELKOO_SHOPPING_BASE).trim()
      ? String(e.KELKOO_SHOPPING_BASE).trim().replace(/\/$/, '')
      : DEFAULT_SHOPPING_BASE;
  return { apiKey, country, baseUrl };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertKelkooCreds(env) {
  const c = readKelkooCreds(env);
  const missing = [];
  if (!c.apiKey) missing.push('KELKOO_API_KEY');
  if (missing.length) {
    throw new KelkooCredsError(
      `Kelkoo Shopping API credentials missing: ${missing.join(', ')}. Set them in providers/live/kelkoo/.env (never commit).`,
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
 * Build GET URL for /search/offers.
 * @param {{ baseUrl: string, country: string }} creds
 * @param {string} query
 * @param {{ pageSize?: number, page?: number }} [opts]
 */
function buildOffersSearchUrl(creds, query, opts) {
  const pageSize =
    opts && opts.pageSize != null ? Number(opts.pageSize) : 20;
  const page = opts && opts.page != null ? Number(opts.page) : 1;
  const u = new URL(`${creds.baseUrl}/search/offers`);
  u.searchParams.set('country', creds.country);
  u.searchParams.set('query', query || ' ');
  u.searchParams.set('fieldsAlias', 'minimal');
  u.searchParams.set('pageSize', String(pageSize > 0 ? pageSize : 20));
  u.searchParams.set('page', String(page > 0 ? page : 1));
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
                `Kelkoo HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Kelkoo HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
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
 * Search Kelkoo offers. Returns the parsed API JSON (not normalized products).
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object>}
 */
async function searchKelkoo(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertKelkooCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg) || ' ';
  const url = buildOffersSearchUrl(creds, keywords);
  const json = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
    },
  });

  return json;
}

module.exports = {
  searchKelkoo,
  assertKelkooCreds,
  readKelkooCreds,
  KelkooCredsError,
  buildOffersSearchUrl,
  keywordsFromMsg,
  DEFAULT_SHOPPING_BASE,
};
