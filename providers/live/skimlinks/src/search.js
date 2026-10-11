'use strict';

/**
 * Skimlinks Product API search client (FR-067 / FR-168).
 * HTTP injectable for recorded fixtures. Registry enabled true (FR-168).
 * normalize / worker wiring landed in later FRs.
 */

class SkimlinksCredsError extends Error {
  constructor(message) {
    super(message || 'skimlinks_missing_credentials');
    this.name = 'SkimlinksCredsError';
    this.code = 'skimlinks_missing_credentials';
  }
}

const DEFAULT_PRODUCT_BASE = 'https://api-product.skimlinks.com/v4';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readSkimlinksCreds(env) {
  const e = env || process.env;
  const apiKey =
    e.SKIMLINKS_API_KEY != null ? String(e.SKIMLINKS_API_KEY).trim() : '';
  const country =
    e.SKIMLINKS_COUNTRY != null && String(e.SKIMLINKS_COUNTRY).trim()
      ? String(e.SKIMLINKS_COUNTRY).trim().toLowerCase()
      : 'uk';
  const baseUrl =
    e.SKIMLINKS_PRODUCT_BASE != null &&
    String(e.SKIMLINKS_PRODUCT_BASE).trim()
      ? String(e.SKIMLINKS_PRODUCT_BASE).trim().replace(/\/$/, '')
      : DEFAULT_PRODUCT_BASE;
  return { apiKey, country, baseUrl };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertSkimlinksCreds(env) {
  const c = readSkimlinksCreds(env);
  const missing = [];
  if (!c.apiKey) missing.push('SKIMLINKS_API_KEY');
  if (missing.length) {
    throw new SkimlinksCredsError(
      `Skimlinks Product API credentials missing: ${missing.join(', ')}. Set them in providers/live/skimlinks/.env (never commit).`,
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
 * Build GET URL for Product API /product/query.
 * @param {{ baseUrl: string, apiKey: string, country: string }} creds
 * @param {string} query
 * @param {{ rows?: number, start?: number }} [opts]
 */
function buildProductQueryUrl(creds, query, opts) {
  const rows = opts && opts.rows != null ? Number(opts.rows) : 20;
  const start = opts && opts.start != null ? Number(opts.start) : 0;
  const u = new URL(`${creds.baseUrl}/product/query`);
  u.searchParams.set('key', creds.apiKey);
  u.searchParams.set('q', query || '*:*');
  u.searchParams.set('rows', String(rows > 0 ? rows : 20));
  u.searchParams.set('start', String(start >= 0 ? start : 0));
  if (creds.country) {
    u.searchParams.set('fq', `country:${creds.country.toUpperCase()}`);
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
                `Skimlinks HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Skimlinks HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
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
 * Search Skimlinks products. Returns the parsed API JSON (not normalized).
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object>}
 */
async function searchSkimlinks(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertSkimlinksCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg) || '*:*';
  const url = buildProductQueryUrl(creds, keywords);
  const json = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Accept: 'application/json',
    },
  });

  return json;
}

module.exports = {
  searchSkimlinks,
  assertSkimlinksCreds,
  readSkimlinksCreds,
  SkimlinksCredsError,
  buildProductQueryUrl,
  keywordsFromMsg,
  DEFAULT_PRODUCT_BASE,
};
