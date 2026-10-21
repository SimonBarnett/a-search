'use strict';

/**
 * Rakuten Product Search (XML) client (FR-040).
 * HTTP injectable for fixtures. XML parsed without a regex-of-the-whole-doc.
 */

const { normalizeSearchItems } = require('./normalize');
const {
  keywordsFromAgentMsg,
  collectExcludeTerms,
  collectQueryTerms,
} = require('../../../../shared/search/keywordsFromAgentMsg');
const {
  keywordsOnly,
  normalizeMarketCurrency,
} = require('../../../../shared/search/cleanSearchQuery');

class RakutenCredsError extends Error {
  constructor(message) {
    super(message || 'rakuten_missing_credentials');
    this.name = 'RakutenCredsError';
    this.code = 'rakuten_missing_credentials';
  }
}

/**
 * FR #4544: Linksynergy Product Search rejects Lucene-style excludes in
 * `keyword` with INVALID_CONTEXT_VALUE. Also flags that ErrorID in responses.
 * @param {unknown} err
 * @returns {boolean}
 */
function isRakutenInvalidContext(err) {
  if (!err || typeof err !== 'object') return false;
  if (/** @type {{ code?: string }} */ (err).code === 'rakuten_invalid_context') {
    return true;
  }
  return /INVALID_CONTEXT_VALUE/i.test(String(err.message || err));
}


/**
 * FR #4768 / #4780: Linksynergy rejects hyphenated tokens and punctuation
 * `( ) , ; .` (and similar) in `keyword` with INVALID_CONTEXT_VALUE.
 * Replace hyphens/punctuation with spaces; collapse whitespace.
 * @param {string} keyword
 * @returns {string}
 */
function sanitizeRakutenKeyword(keyword) {
  const raw = String(keyword || '').trim();
  if (!raw) return '';
  return raw
    .replace(/-/g, ' ')
    // FR #4780: probe on redqueen — stripping ( ) , ; . turns 400 into 200.
    .replace(/[()[\]{},;.:'"!?/\\`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FR #4781: Linksynergy `none` with a long worker-built string returns the
 * whole advertiser catalogue (widens, does not narrow). Do not send `none`.
 * Keep full exclude phrases (len>=3) for client-side title filtering.
 * @param {object|null|undefined} msg
 * @returns {string[]}
 */
function excludeTermsFromMsg(msg) {
  const seen = new Set();
  const out = [];
  for (const phrase of collectExcludeTerms(msg)) {
    const t = String(phrase || '').trim();
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * @param {{ title?: string }|null|undefined} product
 * @param {string[]} excludeTerms
 * @returns {boolean}
 */
function productExcludedByTerms(product, excludeTerms) {
  if (!product || !Array.isArray(excludeTerms) || !excludeTerms.length) {
    return false;
  }
  const title = String(product.title || '').toLowerCase();
  if (!title) return false;
  for (const term of excludeTerms) {
    const needle = String(term || '').trim().toLowerCase();
    if (needle.length >= 3 && title.includes(needle)) return true;
  }
  return false;
}

/**
 * @deprecated FR #4781 — `none` is never sent; use excludeTermsFromMsg.
 * @param {object|null|undefined} msg
 * @returns {string} always empty
 */
function buildRakutenNone(_msg) {
  return '';
}

/**
 * Non-empty query strings for one Product Search call each (eBay #4446 pattern).
 * FR #4780 / #4563: strip market/location/currency residue before sanitize.
 * @param {object} msg
 * @returns {string[]}
 */
function queryTextsFromMsg(msg) {
  const fromQueries = collectQueryTerms(msg);
  const raw =
    fromQueries.length > 0
      ? fromQueries
      : msg && typeof msg.q === 'string' && msg.q.trim()
        ? [msg.q.trim()]
        : [];
  if (!raw.length) return [];
  const { market, currency } = normalizeMarketCurrency(msg || {});
  const stripMarket =
    market || (msg && msg.market != null ? String(msg.market) : '');
  const stripCurrency =
    currency || (msg && msg.currency != null ? String(msg.currency) : '');
  return raw
    .map((t) => keywordsOnly(t, stripMarket, stripCurrency))
    .map((t) => sanitizeRakutenKeyword(t))
    .filter(Boolean);
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

/**
 * Build Product Search URL.
 * @param {string} endpoint
 * @param {string|{ keyword?: string, none?: string, language?: string, max?: number }} keywordOrOpts
 *   string = keyword only (legacy). Object form: keyword + language (default en_US).
 *   FR #4781: do not rely on `none` (Linksynergy widens); searchRakuten never sends it.
 *   `none` remains only for low-level URL unit tests.
 */
function productSearchUrl(endpoint, keywordOrOpts) {
  const raw = String(endpoint || DEFAULT_PRODUCT_SEARCH_URL).trim();
  const withPath = /productsearch\/1\.0/i.test(raw)
    ? raw
    : `${raw.replace(/\/$/, '')}/productsearch/1.0`;
  const u = new URL(withPath);
  let keyword = '';
  let none = '';
  let language = 'en_US';
  let max = 10;
  if (keywordOrOpts && typeof keywordOrOpts === 'object') {
    keyword = String(keywordOrOpts.keyword || '').trim();
    none = String(keywordOrOpts.none || '').trim();
    language = String(keywordOrOpts.language || 'en_US').trim() || 'en_US';
    const m = Number(keywordOrOpts.max);
    if (Number.isFinite(m) && m > 0) max = Math.floor(m);
  } else {
    keyword = String(keywordOrOpts || '').trim();
  }
  u.searchParams.set('keyword', keyword);
  u.searchParams.set('max', String(max));
  if (none) u.searchParams.set('none', none);
  if (language) u.searchParams.set('language', language);
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

function keywordsFromMsg(msg) {
  // FR #4450 / #4446: shared export keeps minus-style for agent contract tests.
  // searchRakuten applies excludes client-side (FR #4781); never Lucene -term in keyword.
  return keywordsFromAgentMsg(msg);
}


/**
 * Extract text content of the first matching child tag (case-insensitive).
 * Walks by tag boundaries --- not a whole-document regex.
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
            // FR #4544: vendor client error --- do not treat as code fatal.
            if (/INVALID_CONTEXT_VALUE/i.test(text)) {
              err.code = 'rakuten_invalid_context';
            }
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
  // FR #4450 / MRB #4456 / FR #4768: empty-guard; one call per query (not AND-joined).
  const texts = queryTextsFromMsg(msg)
    .map((t) => sanitizeRakutenKeyword(t))
    .filter(Boolean);
  if (!texts.length) return [];
  const envVars = (deps && deps.env) || process.env;
  const creds = assertRakutenCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  // FR #4781: never send `none` (widens catalogue); filter excludes on title locally.
  // FR #4544: never put Lucene -term in keyword.
  const excludeTerms = excludeTermsFromMsg(msg);
  const language =
    String(envVars.RAKUTEN_LANGUAGE || 'en_US').trim() || 'en_US';
  const useCache = httpRequest === defaultHttpRequest;
  const accessToken = await fetchRakutenAccessToken(
    creds,
    httpRequest,
    Date.now(),
    useCache,
  );

  const capRaw = Number(msg && msg.maxResults);
  const cap = Number.isFinite(capRaw) && capRaw > 0 ? Math.min(50, Math.floor(capRaw)) : 10;
  const merged = [];
  const seen = new Set();
  const normOpts = {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars,
  };
  let lastInvalidContext = null;

  for (const keyword of texts) {
    if (merged.length >= cap) break;
    const url = productSearchUrl(creds.endpoint, {
      keyword,
      language,
      max: Math.min(10, cap - merged.length),
    });
    let res;
    try {
      res = await httpRequest({
        method: 'GET',
        url,
        headers: {
          Accept: 'application/xml, text/xml, */*',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      // FR #4768 / #4769: skip this query on INVALID_CONTEXT; throw if all fail (DLQ).
      if (isRakutenInvalidContext(err)) {
        lastInvalidContext = err;
        if (lastInvalidContext && typeof lastInvalidContext === 'object') {
          lastInvalidContext.code =
            lastInvalidContext.code || 'rakuten_invalid_context';
          lastInvalidContext.nonRetryable = true;
        }
        // eslint-disable-next-line no-console
        console.warn(
          '[rakuten] INVALID_CONTEXT_VALUE keywordLen=%s excludeCount=%s',
          keyword.length,
          excludeTerms.length,
        );
        continue;
      }
      throw err;
    }

    const xml =
      typeof res === 'string'
        ? res
        : res && typeof res.body === 'string'
          ? res.body
          : '';
    if (/INVALID_CONTEXT_VALUE/i.test(xml)) {
      lastInvalidContext = Object.assign(new Error('Rakuten INVALID_CONTEXT_VALUE in body'), {
        code: 'rakuten_invalid_context',
        statusCode: 400,
        nonRetryable: true,
      });
      // eslint-disable-next-line no-console
      console.warn(
        '[rakuten] INVALID_CONTEXT_VALUE (body) keywordLen=%s excludeCount=%s',
        keyword.length,
        excludeTerms.length,
      );
      continue;
    }
    const rawItems = parseProductSearchXml(xml);
    const products = normalizeSearchItems(rawItems, normOpts);
    for (const p of products) {
      if (productExcludedByTerms(p, excludeTerms)) continue;
      const id = p && p.id != null ? String(p.id) : '';
      if (id) {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      merged.push(p);
      if (merged.length >= cap) break;
    }
  }

  if (!merged.length && lastInvalidContext) {
    throw lastInvalidContext;
  }
  return merged;
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
  isRakutenInvalidContext,
  sanitizeRakutenKeyword,
  buildRakutenNone,
  excludeTermsFromMsg,
  productExcludedByTerms,
  queryTextsFromMsg,
  DEFAULT_TOKEN_URL,
  DEFAULT_PRODUCT_SEARCH_URL,
};
