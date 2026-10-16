'use strict';

/**
 * Etsy Open API v3 listing search client (FR-075 / FR-170 / FR-244).
 * x-api-key must be keystring:shared_secret (breaking since 2026-02-09).
 * HTTP injectable for recorded fixtures.
 */

class EtsyCredsError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code) {
    super(message || 'etsy_missing_credentials');
    this.name = 'EtsyCredsError';
    this.code = code || 'etsy_missing_credentials';
  }
}

const DEFAULT_API_BASE = 'https://openapi.etsy.com/v3';

/**
 * Build Open API v3 x-api-key header value.
 * If keystring already contains `:`, use as-is; else append shared secret.
 * @param {string} keystring
 * @param {string} sharedSecret
 * @returns {string}
 */
function buildEtsyApiKeyHeader(keystring, sharedSecret) {
  const key = String(keystring || '').trim();
  const secret = String(sharedSecret || '').trim();
  if (!key) return '';
  if (key.includes(':')) return key;
  if (!secret) return '';
  return `${key}:${secret}`;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readEtsyCreds(env) {
  const e = env || process.env;
  const keystring =
    e.ETSY_API_KEY != null
      ? String(e.ETSY_API_KEY).trim()
      : e.ETSY_KEYSTRING != null
        ? String(e.ETSY_KEYSTRING).trim()
        : '';
  const sharedSecret =
    e.ETSY_SHARED_SECRET != null ? String(e.ETSY_SHARED_SECRET).trim() : '';
  const baseUrl =
    e.ETSY_API_BASE != null && String(e.ETSY_API_BASE).trim()
      ? String(e.ETSY_API_BASE).trim().replace(/\/$/, '')
      : DEFAULT_API_BASE;
  const apiKey = buildEtsyApiKeyHeader(keystring, sharedSecret);
  return { keystring, sharedSecret, apiKey, baseUrl };
}

/**
 * Fail closed when keystring or shared secret missing (unless keystring already
 * embeds `key:secret`).
 * @param {Record<string, string|undefined>} [env]
 */
function assertEtsyCreds(env) {
  const c = readEtsyCreds(env);
  if (!c.keystring) {
    throw new EtsyCredsError(
      'Etsy Open API credentials missing: ETSY_API_KEY. Set them in providers/live/etsy/.env (never commit).',
      'etsy_missing_credentials',
    );
  }
  if (!c.keystring.includes(':') && !c.sharedSecret) {
    throw new EtsyCredsError(
      'Etsy Open API shared secret missing: ETSY_SHARED_SECRET (required as x-api-key keystring:secret since 2026-02-09).',
      'missing_shared_secret',
    );
  }
  if (!c.apiKey) {
    throw new EtsyCredsError(
      'Etsy Open API credentials incomplete for x-api-key header.',
      'etsy_missing_credentials',
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
 * @param {{ limit?: number, offset?: number, sortOn?: string, minPrice?: number, maxPrice?: number }} [opts]
 */
function buildListingsSearchUrl(creds, query, opts) {
  const limit = opts && opts.limit != null ? Number(opts.limit) : 20;
  const offset = opts && opts.offset != null ? Number(opts.offset) : 0;
  const capped = limit > 100 ? 100 : limit > 0 ? limit : 20;
  const u = new URL(`${creds.baseUrl}/application/listings/active`);
  u.searchParams.set('keywords', query || ' ');
  u.searchParams.set('limit', String(capped));
  u.searchParams.set('offset', String(offset >= 0 ? offset : 0));
  u.searchParams.set('includes', 'Images');
  if (opts && opts.sortOn) u.searchParams.set('sort_on', String(opts.sortOn));
  if (opts && opts.minPrice != null) {
    u.searchParams.set('min_price', String(opts.minPrice));
  }
  if (opts && opts.maxPrice != null) {
    u.searchParams.set('max_price', String(opts.maxPrice));
  }
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
  const url = buildListingsSearchUrl(creds, keywords, {
    limit: msg && msg.limit,
    offset: msg && msg.offset,
  });
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
  buildEtsyApiKeyHeader,
  EtsyCredsError,
  buildListingsSearchUrl,
  keywordsFromMsg,
  DEFAULT_API_BASE,
};
