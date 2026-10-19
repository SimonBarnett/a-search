'use strict';

/**
 * Rakuten Product Search (XML) client (FR-040).
 * HTTP injectable for fixtures. XML parsed without a regex-of-the-whole-doc.
 */

const { normalizeSearchItems } = require('./normalize');

class RakutenCredsError extends Error {
  constructor(message) {
    super(message || 'missing_rakuten_token');
    this.name = 'RakutenCredsError';
    this.code = 'missing_rakuten_token';
  }
}

const DEFAULT_PRODUCT_SEARCH_URL =
  'https://api.linksynergy.com/productsearch/1.0';

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readRakutenCreds(env) {
  const e = env || process.env;
  const token =
    e.RAKUTEN_PRODUCT_SEARCH_TOKEN != null
      ? String(e.RAKUTEN_PRODUCT_SEARCH_TOKEN).trim()
      : '';
  const endpoint =
    e.RAKUTEN_ENDPOINT != null && String(e.RAKUTEN_ENDPOINT).trim()
      ? String(e.RAKUTEN_ENDPOINT).trim()
      : DEFAULT_PRODUCT_SEARCH_URL;
  return { token, endpoint };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertRakutenCreds(env) {
  const c = readRakutenCreds(env);
  if (!c.token) {
    throw new RakutenCredsError(
      'Rakuten Product Search token missing: RAKUTEN_PRODUCT_SEARCH_TOKEN. Set it in providers/live/rakuten/.env (never commit).',
    );
  }
  return c;
}

/**
 * Documented publisher Product Search: GET api.linksynergy.com/productsearch/1.0
 * with Authorization Bearer. The token is never placed on the URL.
 * @param {{ token: string, endpoint: string }} creds
 * @param {string} keyword
 */
function buildProductSearchRequest(creds, keyword) {
  const base = String(creds.endpoint || DEFAULT_PRODUCT_SEARCH_URL).trim();
  const withPath = /productsearch\/1\.0/i.test(base)
    ? base
    : `${base.replace(/\/$/, '')}/productsearch/1.0`;
  const u = new URL(withPath);
  u.searchParams.set('keyword', keyword);
  u.searchParams.set('max', '10');
  return {
    method: 'GET',
    url: u.toString(),
    headers: {
      Accept: 'application/xml, text/xml, */*',
      Authorization: `Bearer ${creds.token}`,
    },
  };
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
  const req = buildProductSearchRequest(creds, keyword);
  const res = await httpRequest(req);

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
  RakutenCredsError,
  parseProductSearchXml,
  keywordsFromMsg,
  buildProductSearchRequest,
  DEFAULT_PRODUCT_SEARCH_URL,
};
