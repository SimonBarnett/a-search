'use strict';

/**
 * Etsy Open API v3 listing search client (FR-075).
 * HTTP injectable for recorded fixtures. Stay-dark: do not enable registry.
 * normalize / worker wiring are out of scope for this FR.
 */

class EtsyCredsError extends Error {
  constructor(message) {
    super(message || 'etsy_missing_credentials');
    this.name = 'EtsyCredsError';
    this.code = 'etsy_missing_credentials';
  }
}

const DEFAULT_API_BASE = 'https://openapi.etsy.com/v3';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readEtsyCreds(env) {
  const e = env || process.env;
  const apiKey =
    e.ETSY_API_KEY != null
      ? String(e.ETSY_API_KEY).trim()
      : e.ETSY_KEYSTRING != null
        ? String(e.ETSY_KEYSTRING).trim()
        : '';
  const baseUrl =
    e.ETSY_API_BASE != null && String(e.ETSY_API_BASE).trim()
      ? String(e.ETSY_API_BASE).trim().replace(/\/$/, '')
      : DEFAULT_API_BASE;
  return { apiKey, baseUrl };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertEtsyCreds(env) {
  const c = readEtsyCreds(env);
  const missing = [];
  if (!c.apiKey) missing.push('ETSY_API_KEY');
  if (missing.length) {
    throw new EtsyCredsError(
      `Etsy Open API credentials missing: ${missing.join(', ')}. Set them in providers/live/etsy/.env (never commit).`,
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
 * Build GET URL for /application/listings/active.
 * @param {{ baseUrl: string }} creds
 * @param {string} query
 * @param {{ limit?: number, offset?: number }} [opts]
 */
function buildListingsSearchUrl(creds, query, opts) {
  const limit = opts && opts.limit != null ? Number(opts.limit) : 20;
  const offset = opts && opts.offset != null ? Number(opts.offset) : 0;
  const u = new URL(`${creds.baseUrl}/application/listings/active`);
  u.searchParams.set('keywords', query || ' ');
  u.searchParams.set('limit', String(limit > 0 ? limit : 20));
  u.searchParams.set('offset', String(offset >= 0 ? offset : 0));
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
                `Etsy HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Etsy HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
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
 * Search Etsy active listings. Returns the parsed API JSON (not normalized).
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object>}
 */
async function searchEtsy(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertEtsyCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg) || ' ';
  const url = buildListingsSearchUrl(creds, keywords);
  const json = await httpRequest({
    method: 'GET',
    url,
    headers: {
      'x-api-key': creds.apiKey,
      Accept: 'application/json',
    },
  });

  return json;
}

module.exports = {
  searchEtsy,
  assertEtsyCreds,
  readEtsyCreds,
  EtsyCredsError,
  buildListingsSearchUrl,
  keywordsFromMsg,
  DEFAULT_API_BASE,
};
