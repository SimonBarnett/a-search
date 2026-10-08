'use strict';

/**
 * AliExpress Affiliate product search client (FR-071).
 * HTTP injectable for recorded fixtures. Stay-dark: do not enable registry.
 * normalize / worker wiring are out of scope for this FR.
 */

class AliexpressCredsError extends Error {
  constructor(message) {
    super(message || 'aliexpress_missing_credentials');
    this.name = 'AliexpressCredsError';
    this.code = 'aliexpress_missing_credentials';
  }
}

/** Default Open Platform sync gateway (affiliate product query). */
const DEFAULT_API_BASE = 'https://api-sg.aliexpress.com/sync';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readAliexpressCreds(env) {
  const e = env || process.env;
  const apiKey =
    e.ALIEXPRESS_API_KEY != null
      ? String(e.ALIEXPRESS_API_KEY).trim()
      : e.ALIEXPRESS_APP_KEY != null
        ? String(e.ALIEXPRESS_APP_KEY).trim()
        : '';
  const trackingId =
    e.ALIEXPRESS_TRACKING_ID != null && String(e.ALIEXPRESS_TRACKING_ID).trim()
      ? String(e.ALIEXPRESS_TRACKING_ID).trim()
      : 'a-search';
  const baseUrl =
    e.ALIEXPRESS_API_BASE != null && String(e.ALIEXPRESS_API_BASE).trim()
      ? String(e.ALIEXPRESS_API_BASE).trim().replace(/\/$/, '')
      : DEFAULT_API_BASE;
  return { apiKey, trackingId, baseUrl };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertAliexpressCreds(env) {
  const c = readAliexpressCreds(env);
  const missing = [];
  if (!c.apiKey) missing.push('ALIEXPRESS_API_KEY');
  if (missing.length) {
    throw new AliexpressCredsError(
      `AliExpress Affiliate credentials missing: ${missing.join(', ')}. Set them in providers/live/aliexpress/.env (never commit).`,
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
 * Build GET URL for affiliate product query (app_key + keywords).
 * @param {{ baseUrl: string, apiKey: string, trackingId: string }} creds
 * @param {string} query
 * @param {{ pageSize?: number, pageNo?: number }} [opts]
 */
function buildProductQueryUrl(creds, query, opts) {
  const pageSize = opts && opts.pageSize != null ? Number(opts.pageSize) : 20;
  const pageNo = opts && opts.pageNo != null ? Number(opts.pageNo) : 1;
  const u = new URL(creds.baseUrl);
  u.searchParams.set('method', 'aliexpress.affiliate.product.query');
  u.searchParams.set('app_key', creds.apiKey);
  u.searchParams.set('keywords', query || '*');
  u.searchParams.set('tracking_id', creds.trackingId);
  u.searchParams.set('page_size', String(pageSize > 0 ? pageSize : 20));
  u.searchParams.set('page_no', String(pageNo > 0 ? pageNo : 1));
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
                `AliExpress HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `AliExpress HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
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
 * Search AliExpress products. Returns the parsed API JSON (not normalized).
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object>}
 */
async function searchAliexpress(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertAliexpressCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keywords = keywordsFromMsg(msg) || '*';
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
  searchAliexpress,
  assertAliexpressCreds,
  readAliexpressCreds,
  AliexpressCredsError,
  buildProductQueryUrl,
  keywordsFromMsg,
  DEFAULT_API_BASE,
};
