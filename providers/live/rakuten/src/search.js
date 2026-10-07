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
function readRakutenCreds(env) {
  const e = env || process.env;
  const applicationKey =
    e.RAKUTEN_APPLICATION_KEY != null
      ? String(e.RAKUTEN_APPLICATION_KEY).trim()
      : '';
  const affiliateId =
    e.RAKUTEN_AFFILIATE_ID != null
      ? String(e.RAKUTEN_AFFILIATE_ID).trim()
      : '';
  const endpoint =
    e.RAKUTEN_ENDPOINT != null && String(e.RAKUTEN_ENDPOINT).trim()
      ? String(e.RAKUTEN_ENDPOINT).trim().replace(/\/?$/, '/')
      : 'https://api.rakuten.com/';
  return { applicationKey, affiliateId, endpoint };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertRakutenCreds(env) {
  const c = readRakutenCreds(env);
  const missing = [];
  if (!c.applicationKey) missing.push('RAKUTEN_APPLICATION_KEY');
  if (missing.length) {
    throw new RakutenCredsError(
      `Rakuten Product Search credentials missing: ${missing.join(', ')}. Set them in providers/live/rakuten/.env (never commit).`,
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
  const envVars = (deps && deps.env) || process.env;
  const creds = assertRakutenCreds(envVars);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;

  const keyword = keywordsFromMsg(msg) || ' ';
  const params = new URLSearchParams({
    applicationkey: creds.applicationKey,
    keyword,
    max: '10',
  });
  if (creds.affiliateId) params.set('affiliateid_1', creds.affiliateId);

  // Common Product Search path under configured endpoint root.
  const url = `${creds.endpoint}productsearch/1.0?${params.toString()}`;
  const res = await httpRequest({
    method: 'GET',
    url,
    headers: { Accept: 'application/xml, text/xml, */*' },
  });

  const xml =
    typeof res === 'string'
      ? res
      : res && typeof res.body === 'string'
        ? res.body
        : '';
  const rawItems = parseProductSearchXml(xml);
  return normalizeSearchItems(rawItems);
}

module.exports = {
  searchRakuten,
  assertRakutenCreds,
  readRakutenCreds,
  RakutenCredsError,
  parseProductSearchXml,
  keywordsFromMsg,
};
