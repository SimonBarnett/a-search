'use strict';

/**
 * eBay Browse API item_summary/search client (FR-039).
 * HTTP is injectable for recorded fixtures.
 */

const { normalizeSearchResponse } = require('./normalize');

class EbayCredsError extends Error {
  constructor(message) {
    super(message || 'ebay_missing_credentials');
    this.name = 'EbayCredsError';
    this.code = 'ebay_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readEbayCreds(env) {
  const e = env || process.env;
  const clientId =
    e.EBAY_CLIENT_ID != null ? String(e.EBAY_CLIENT_ID).trim() : '';
  const clientSecret =
    e.EBAY_CLIENT_SECRET != null ? String(e.EBAY_CLIENT_SECRET).trim() : '';
  const refreshToken =
    e.EBAY_REFRESH_TOKEN != null ? String(e.EBAY_REFRESH_TOKEN).trim() : '';
  const marketplaceId =
    e.EBAY_MARKETPLACE_ID != null && String(e.EBAY_MARKETPLACE_ID).trim()
      ? String(e.EBAY_MARKETPLACE_ID).trim()
      : 'EBAY_GB';
  const ebayEnv =
    e.EBAY_ENV != null && String(e.EBAY_ENV).trim()
      ? String(e.EBAY_ENV).trim().toLowerCase()
      : String(e.A_SEARCH_ENV || 'sandbox').toLowerCase() === 'live'
        ? 'production'
        : 'sandbox';
  return { clientId, clientSecret, refreshToken, marketplaceId, ebayEnv };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertEbayCreds(env) {
  const c = readEbayCreds(env);
  const missing = [];
  if (!c.clientId) missing.push('EBAY_CLIENT_ID');
  if (!c.clientSecret) missing.push('EBAY_CLIENT_SECRET');
  if (missing.length) {
    throw new EbayCredsError(
      `eBay Browse API credentials missing: ${missing.join(', ')}. Set them in providers/live/ebay/.env (never commit).`,
    );
  }
  return c;
}

/**
 * Non-empty query strings from an agent /search or legacy fan-out message.
 * Prefers `queries` (searches.json shape: string or {q}), then `q`, then
 * `searchterms` joined as one string.
 * @param {object} msg
 * @returns {string[]}
 */
function queryTextsFromMsg(msg) {
  if (msg && Array.isArray(msg.queries) && msg.queries.length) {
    const parts = [];
    for (const row of msg.queries) {
      if (typeof row === 'string' && row.trim()) {
        parts.push(row.trim());
        continue;
      }
      if (row && typeof row === 'object' && row.q != null) {
        const text = String(row.q).trim();
        if (text) parts.push(text);
      }
    }
    if (parts.length) return parts;
  }
  if (msg && typeof msg.q === 'string' && msg.q.trim()) {
    return [msg.q.trim()];
  }
  if (msg && Array.isArray(msg.searchterms)) {
    const parts = msg.searchterms
      .filter((t) => typeof t === 'string' && t.trim())
      .map((t) => t.trim());
    if (parts.length) return [parts.join(' ')];
  }
  return [];
}

/**
 * Exclude match terms from msg.exclude (string or {match}). Skip tokens
 * shorter than 3 chars (FR #4318 whole-word rule).
 * @param {object} msg
 * @returns {string[]}
 */
function excludeMatchTerms(msg) {
  if (!msg || !Array.isArray(msg.exclude)) return [];
  const out = [];
  for (const rule of msg.exclude) {
    let term = '';
    if (typeof rule === 'string') term = rule.trim();
    else if (rule && typeof rule === 'object' && rule.match != null) {
      term = String(rule.match).trim();
    }
    if (term.length >= 3) out.push(term);
  }
  return out;
}

/**
 * Build Browse API `q` from one query text plus `-term` exclusions.
 * @param {string} queryText
 * @param {Array<string|{match?: string}>} [exclude]
 * @returns {string}
 */
function buildEbayBrowseQ(queryText, exclude) {
  const base = queryText != null ? String(queryText).trim() : '';
  if (!base) return '';
  const terms =
    Array.isArray(exclude) && exclude.length && typeof exclude[0] === 'string'
      ? exclude.filter((t) => typeof t === 'string' && t.trim().length >= 3).map((t) => t.trim())
      : excludeMatchTerms({ exclude });
  let q = base;
  for (const term of terms) {
    if (/\s/.test(term)) {
      q += ` -"${term.replace(/"/g, '')}"`;
    } else {
      q += ` -${term}`;
    }
  }
  return q;
}

function keywordsFromMsg(msg) {
  const texts = queryTextsFromMsg(msg);
  return texts.length ? texts.join(' ') : '';
}

function apiHost(ebayEnv) {
  return ebayEnv === 'production' || ebayEnv === 'live'
    ? 'api.ebay.com'
    : 'api.sandbox.ebay.com';
}

/**
 * Default Node https POST/GET helper (JSON).
 * @param {{ method: string, url: string, headers?: object, body?: string }} req
 */
async function defaultHttpRequest(req) {
  const https = require('node:https');
  const { URL } = require('node:url');
  const u = new URL(req.url);
  const payload = req.body != null ? String(req.body) : null;
  const headers = Object.assign({}, req.headers || {});
  if (payload != null && !headers['Content-Length']) {
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
                `eBay HTTP non-JSON ${res.statusCode}: ${text.slice(0, 200)}`,
              ),
            );
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `eBay HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
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
 * Client-credentials (or refresh) token for Browse API.
 * @param {ReturnType<typeof assertEbayCreds>} creds
 * @param {Function} httpRequest
 */
async function fetchAccessToken(creds, httpRequest) {
  const host = apiHost(creds.ebayEnv);
  const basic = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`,
    'utf8',
  ).toString('base64');
  const body = creds.refreshToken
    ? `grant_type=refresh_token&refresh_token=${encodeURIComponent(creds.refreshToken)}&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope')}`
    : `grant_type=client_credentials&scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope')}`;
  const tokenJson = await httpRequest({
    method: 'POST',
    url: `https://${host}/identity/v1/oauth2/token`,
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const token = tokenJson && tokenJson.access_token;
  if (!token) {
    throw new Error('eBay OAuth response missing access_token');
  }
  return String(token);
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   accessToken?: string,
 * }} [deps]
 * @returns {Promise<object[]>}
 */
async function searchEbay(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  const creds = assertEbayCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  // FR #4446: never Browse with a blank q / space. Empty queries → empty products.
  const texts = queryTextsFromMsg(msg);
  if (!texts.length) {
    return [];
  }
  const excludeTerms = excludeMatchTerms(msg);

  const token =
    deps && typeof deps.accessToken === 'string' && deps.accessToken
      ? deps.accessToken
      : await fetchAccessToken(creds, httpRequest);

  const host = apiHost(creds.ebayEnv);
  const cap = 10;
  const merged = [];
  const seen = new Set();
  const normOpts = {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars,
  };

  for (const text of texts) {
    if (merged.length >= cap) break;
    const q = buildEbayBrowseQ(text, excludeTerms);
    if (!q) continue;
    const limit = Math.min(cap, cap - merged.length);
    const url = `https://${host}/buy/browse/v1/item_summary/search?q=${encodeURIComponent(q)}&limit=${limit}`;
    const browseJson = await httpRequest({
      method: 'GET',
      url,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': creds.marketplaceId,
        Accept: 'application/json',
      },
    });
    const products = normalizeSearchResponse(browseJson, normOpts);
    for (const p of products) {
      const id = p && p.id != null ? String(p.id) : '';
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(p);
      if (merged.length >= cap) break;
    }
  }
  return merged;
}

module.exports = {
  searchEbay,
  assertEbayCreds,
  readEbayCreds,
  EbayCredsError,
  normalizeSearchResponse,
  fetchAccessToken,
  apiHost,
  keywordsFromMsg,
  queryTextsFromMsg,
  excludeMatchTerms,
  buildEbayBrowseQ,
};
