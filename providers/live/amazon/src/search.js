'use strict';

/**
 * Amazon Product Advertising API 5 SearchItems client (FR-030).
 * HTTP is injectable for recorded fixtures; default posts a signed request
 * when credentials + host are present.
 */

const crypto = require('node:crypto');
const { normalizeSearchResponse } = require('./normalize');

class AmazonCredsError extends Error {
  constructor(message) {
    super(message || 'amazon_missing_credentials');
    this.name = 'AmazonCredsError';
    this.code = 'amazon_missing_credentials';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readAmazonCreds(env) {
  const e = env || process.env;
  const accessKey = e.AMAZON_ACCESS_KEY != null ? String(e.AMAZON_ACCESS_KEY).trim() : '';
  const secretKey = e.AMAZON_SECRET_KEY != null ? String(e.AMAZON_SECRET_KEY).trim() : '';
  const partnerTag =
    e.AMAZON_PARTNER_TAG != null ? String(e.AMAZON_PARTNER_TAG).trim() : '';
  const host =
    e.AMAZON_HOST != null && String(e.AMAZON_HOST).trim()
      ? String(e.AMAZON_HOST).trim()
      : 'webservices.amazon.co.uk';
  const region =
    e.AMAZON_REGION != null && String(e.AMAZON_REGION).trim()
      ? String(e.AMAZON_REGION).trim()
      : 'eu-west-1';
  return { accessKey, secretKey, partnerTag, host, region };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertAmazonCreds(env) {
  const c = readAmazonCreds(env);
  const missing = [];
  if (!c.accessKey) missing.push('AMAZON_ACCESS_KEY');
  if (!c.secretKey) missing.push('AMAZON_SECRET_KEY');
  if (!c.partnerTag) missing.push('AMAZON_PARTNER_TAG');
  if (missing.length) {
    throw new AmazonCredsError(
      `Amazon PA-API credentials missing: ${missing.join(', ')}. Set them in providers/live/amazon/.env (never commit).`,
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
 * Build SearchItems JSON body (PA-API 5).
 */
function buildSearchItemsBody(msg, creds) {
  const keywords = keywordsFromMsg(msg);
  return {
    PartnerTag: creds.partnerTag,
    PartnerType: 'Associates',
    Marketplace: marketplaceForHost(creds.host),
    Keywords: keywords || ' ',
    SearchIndex: 'All',
    Resources: [
      'Images.Primary.Large',
      'ItemInfo.Title',
      'Offers.Listings.Price',
    ],
    ItemCount: 10,
  };
}

function marketplaceForHost(host) {
  if (/amazon\.com$/i.test(host)) return 'www.amazon.com';
  if (/amazon\.co\.uk$/i.test(host)) return 'www.amazon.co.uk';
  if (/amazon\.de$/i.test(host)) return 'www.amazon.de';
  return 'www.amazon.co.uk';
}

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Minimal SigV4 for PA-API POST (execute-api style host).
 */
function signPaapiRequest({ host, region, accessKey, secretKey, body }) {
  const service = 'ProductAdvertisingAPI';
  const method = 'POST';
  const canonicalUri = '/paapi5/searchitems';
  const amzTarget = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';
  const contentType = 'application/json; charset=utf-8';
  const now = new Date();
  const amzDate =
    now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalHeaders =
    `content-encoding:amz-1.0\n` +
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    `x-amz-target:${amzTarget}\n`;
  const signedHeaders =
    'content-encoding;content-type;host;x-amz-date;x-amz-target';
  const canonicalRequest = [
    method,
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto
    .createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    url: `https://${host}${canonicalUri}`,
    method,
    headers: {
      'content-encoding': 'amz-1.0',
      'content-type': contentType,
      host,
      'x-amz-date': amzDate,
      'x-amz-target': amzTarget,
      authorization,
    },
    body,
  };
}

/**
 * Default HTTP: signed POST via global fetch (Node 20+).
 * @param {object} signed
 * @returns {Promise<object>}
 */
async function defaultHttpRequest(signed) {
  const res = await fetch(signed.url, {
    method: signed.method,
    headers: signed.headers,
    body: signed.body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Amazon PA-API non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    const err = new Error(
      `Amazon PA-API HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: (signed: object) => Promise<object>,
 * }} [deps]
 * @returns {Promise<object[]>} products
 */
async function searchAmazon(msg, deps) {
  const env = (deps && deps.env) || process.env;
  const creds = assertAmazonCreds(env);
  const payload = buildSearchItemsBody(msg, creds);
  const body = JSON.stringify(payload);
  const signed = signPaapiRequest({
    host: creds.host,
    region: creds.region,
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    body,
  });
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultHttpRequest;
  const json = await httpRequest(signed);
  return normalizeSearchResponse(json, {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars: env,
  });
}

module.exports = {
  searchAmazon,
  assertAmazonCreds,
  AmazonCredsError,
  buildSearchItemsBody,
  signPaapiRequest,
  readAmazonCreds,
  keywordsFromMsg,
};
