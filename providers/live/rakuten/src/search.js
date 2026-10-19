'use strict';

/**
 * Rakuten Product Search (XML) client (FR-040).
 * HTTP injectable for fixtures. XML parsed without a regex-of-the-whole-doc.
 */

const { normalizeSearchItems } = require('./normalize');

class RakutenCredsError extends Error {
  constructor(message) {
    super(message || 'rakuten_missing_credentials');
    this.name = 'RakutenCredsError';
    this.code = 'rakuten_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
const DEFAULT_TOKEN_URL = 'https://api.linksynergy.com/token';
const DEFAULT_PRODUCT_SEARCH_URL =
  'https://api.linksynergy.com/productsearch/1.0';

function readRakutenCreds(env) {
  const e = env || process.env;
  const clientId =
    e.RAKUTEN_CLIENT_ID != null ? String(e.RAKUTEN_CLIENT_ID).trim() : '';
  const clientSecret =
    e.RAKUTEN_CLIENT_SECRET != null
      ? String(e.RAKUTEN_CLIENT_SECRET).trim()
      : '';
  const sid = e.RAKUTEN_SID != null ? String(e.RAKUTEN_SID).trim() : '';
  const tokenUrl =
    e.RAKUTEN_TOKEN_URL != null && String(e.RAKUTEN_TOKEN_URL).trim()
      ? String(e.RAKUTEN_TOKEN_URL).trim()
      : DEFAULT_TOKEN_URL;
  const endpoint =
    e.RAKUTEN_ENDPOINT != null && String(e.RAKUTEN_ENDPOINT).trim()
      ? String(e.RAKUTEN_ENDPOINT).trim()
      : DEFAULT_PRODUCT_SEARCH_URL;
  return { clientId, clientSecret, sid, tokenUrl, endpoint };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertRakutenCreds(env) {
  const c = readRakutenCreds(env);
  const missing = [];
  if (!c.clientId) missing.push('RAKUTEN_CLIENT_ID');
  if (!c.clientSecret) missing.push('RAKUTEN_CLIENT_SECRET');
  if (!c.sid) missing.push('RAKUTEN_SID');
  if (missing.length) {
    throw new RakutenCredsError(
      `Rakuten Product Search credentials missing: ${missing.join(', ')}. Set them in providers/live/rakuten/.env (never commit).`,
    );
  }
  return c;
}

/** In-process token cache for the real HTTP client only. */
let tokenCache = {
  clientId: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
};

function resetRakutenTokenCache() {
  tokenCache = {
    clientId: '',
    accessToken: '',
    refreshToken: '',
    expiresAt: 0,
  };
}

function productSearchUrl(endpoint, keyword) {
  const raw = String(endpoint || DEFAULT_PRODUCT_SEARCH_URL).trim();
  const withPath = /productsearch\/1\.0/i.test(raw)
    ? raw
    : `${raw.replace(/\/$/, '')}/productsearch/1.0`;
  const u = new URL(withPath);
  u.searchParams.set('keyword', keyword);
  u.searchParams.set('max', '10');
  return u.toString();
}

/**
 * @param {ReturnType<typeof readRakutenCreds>} creds
 * @param {Function} httpRequest
 * @param {number} now
 * @param {boolean} useCache
 */
async function fetchRakutenAccessToken(creds, httpRequest, now, useCache) {
  const skewMs = 60 * 1000;
  if (
    useCache &&
    tokenCache.accessToken &&
    tokenCache.clientId === creds.clientId &&
    tokenCache.expiresAt - skewMs > now
  ) {
    return tokenCache.accessToken;
  }
  const basic = Buffer.from(
    `${creds.clientId}:${creds.clientSecret}`,
  ).toString('base64');
  const refreshing = useCache && tokenCache.refreshToken &&
    tokenCache.clientId === creds.clientId;
  const body = refreshing
    ? `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenCache.refreshToken)}&scope=${encodeURIComponent(creds.sid)}`
    : `scope=${encodeURIComponent(creds.sid)}`;
  const res = await httpRequest({
    method: 'POST',
    url: creds.tokenUrl,
    headers: {
      Authorization: `Bearer ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text =
    typeof res === 'string'
      ? res
      : res && typeof res.body === 'string'
        ? res.body
        : '';
  let json;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new RakutenCredsError('Rakuten token response was not JSON');
  }
  const accessToken = json && json.access_token ? String(json.access_token) : '';
  if (!accessToken) {
    throw new RakutenCredsError('Rakuten token response missing access_token');
  }
  const expiresIn = Number(json.expires_in || 3600);
  if (useCache) {
    tokenCache = {
      clientId: creds.clientId,
      accessToken,
      refreshToken: json.refresh_token
        ? String(json.refresh_token)
        : tokenCache.refreshToken,
      expiresAt: now + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    };
  }
  return accessToken;
}

const {
  keywordsFromAgentMsg,
} = require('../../../../shared/search/keywordsFromAgentMsg');

function keywordsFromMsg(msg) {
  // FR #4450 / #4446: agent fan-out uses queries/exclude (legacy q/searchterms kept).
  return keywordsFromAgentMsg(msg);
}


/**
 * Extract text content of the first matching child tag (case-insensitive).
 * Walks by tag boundaries — not a whole-document regex.
 * @param {string} block
 * @param {string} tag
 */
function childText(block, tag) {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const lower = block.toLowerCase();
  const t = tag.toLowerCase();
  let i = lower.indexOf(`<${t}`);
  if (i < 0) return undefined;
  const gt = block.indexOf('>', i);
  if (gt < 0) return undefined;
  // self-closing
  if (block.slice(i, gt + 1).endsWith('/>')) return '';
  const start = gt + 1;
  const end = lower.indexOf(`</${t}>`, start);
  if (end < 0) return undefined;
  return block
    .slice(start, end)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Split XML into <item>...</item> (or <product>) element bodies.
 * @param {string} xml
 * @returns {object[]}
 */
function parseProductSearchXml(xml) {
  if (typeof xml !== 'string' || !xml.trim()) return [];
  const items = [];
  const lower = xml.toLowerCase();
  for (const tag of ['item', 'product']) {
    const openNeedle = `<${tag}`;
    const closeNeedle = `</${tag}>`;
    let from = 0;
    while (from < xml.length) {
      const i = lower.indexOf(openNeedle, from);
      if (i < 0) break;
      const gt = xml.indexOf('>', i);
      if (gt < 0) break;
      if (xml.slice(i, gt + 1).endsWith('/>')) {
        from = gt + 1;
        continue;
      }
      const end = lower.indexOf(closeNeedle, gt + 1);
      if (end < 0) break;
      const block = xml.slice(gt + 1, end);
      items.push({
        productid: childText(block, 'productid') || childText(block, 'sku'),
        productname:
          childText(block, 'productname') || childText(block, 'name'),
        price: childText(block, 'price') || childText(block, 'saleprice'),
        currency: childText(block, 'currency'),
        linkurl: childText(block, 'linkurl') || childText(block, 'url'),
        imageurl: childText(block, 'imageurl') || childText(block, 'image'),
        mid: childText(block, 'mid'),
        sku: childText(block, 'sku'),
      });
      from = end + closeNeedle.length;
    }
    if (items.length) break;
  }
  return items;
}

/**
 * @param {{ method: string, url: string, headers?: object, body?: string }} req
 */
async function defaultHttpRequest(req) {
  const https = require('node:https');
  const http = require('node:http');
  const { URL } = require('node:url');
  const u = new URL(req.url);
  const lib = u.protocol === 'http:' ? http : https;
  const payload = req.body != null ? String(req.body) : null;
  const headers = Object.assign({}, req.headers || {});
  if (payload != null && headers['Content-Length'] == null) {
    headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return new Promise((resolve, reject) => {
    const r = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: req.method || 'GET',
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode === 429 || res.statusCode === 503) {
            const err = new Error(
              `Rakuten rate limited HTTP ${res.statusCode}; honour Retry-After and backoff`,
            );
            err.statusCode = res.statusCode;
            err.retryAfter = res.headers['retry-after'];
            reject(err);
            return;
          }
          if (res.statusCode >= 400) {
            const err = new Error(
              `Rakuten HTTP ${res.statusCode}: ${text.slice(0, 300)}`,
            );
            err.statusCode = res.statusCode;
            reject(err);
            return;
          }
          resolve({ statusCode: res.statusCode, headers: res.headers, body: text });
        });
      },
    );
    r.on('error', reject);
    if (payload != null) r.write(payload);
    r.end();
  });
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 * }} [deps]
 * @returns {Promise<object[]>}
 */
async function searchRakuten(msg, deps) {
  if (!keywordsFromMsg(msg)) return [];
  const envVars = (deps && deps.env) || process.env;
  const creds = assertRakutenCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keyword = keywordsFromMsg(msg);
  const useCache = httpRequest === defaultHttpRequest;
  const accessToken = await fetchRakutenAccessToken(
    creds,
    httpRequest,
    Date.now(),
    useCache,
  );
  const url = productSearchUrl(creds.endpoint, keyword);
  const res = await httpRequest({
    method: 'GET',
    url,
    headers: {
      Accept: 'application/xml, text/xml, */*',
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const xml =
    typeof res === 'string'
      ? res
      : res && typeof res.body === 'string'
        ? res.body
        : '';
  const rawItems = parseProductSearchXml(xml);
  return normalizeSearchItems(rawItems, {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars,
  });
}

module.exports = {
  searchRakuten,
  assertRakutenCreds,
  readRakutenCreds,
  fetchRakutenAccessToken,
  productSearchUrl,
  resetRakutenTokenCache,
  RakutenCredsError,
  parseProductSearchXml,
  keywordsFromMsg,
  DEFAULT_TOKEN_URL,
  DEFAULT_PRODUCT_SEARCH_URL,
};
