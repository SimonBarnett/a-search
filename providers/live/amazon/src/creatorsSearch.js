'use strict';

/**
 * Amazon Associates Creators API search client (FR-182).
 * Flagged off by default; PA-API remains the live path (FR-181).
 * HTTP is injectable for recorded fixtures (no live network in pins).
 */

const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const { TrackedUrlError } = require('../../../../shared/links/buildTrackedUrl');
const { stampAmazonTrackedUrl } = require('./stampAmazonTrackedUrl');
const { keywordsFromMsg } = require('./search');

class AmazonCreatorsCredsError extends Error {
  constructor(message) {
    super(message || 'amazon_creators_missing_credentials');
    this.name = 'AmazonCreatorsCredsError';
    this.code = 'amazon_creators_missing_credentials';
  }
}

/**
 * Feature flag (FR-181 / FR-182): default off.
 * Enable with AMAZON_SEARCH_API=creators or AMAZON_CREATORS_ENABLED=true|1|yes.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
function isCreatorsSearchEnabled(env) {
  const e = env || process.env;
  const api = e.AMAZON_SEARCH_API != null ? String(e.AMAZON_SEARCH_API).trim().toLowerCase() : '';
  if (api === 'creators' || api === 'creators_api') return true;
  const flag = e.AMAZON_CREATORS_ENABLED != null ? String(e.AMAZON_CREATORS_ENABLED).trim().toLowerCase() : '';
  return flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on';
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readCreatorsCreds(env) {
  const e = env || process.env;
  const credential =
    e.AMAZON_CREATORS_CREDENTIAL != null
      ? String(e.AMAZON_CREATORS_CREDENTIAL).trim()
      : '';
  const partnerTag =
    e.AMAZON_PARTNER_TAG != null ? String(e.AMAZON_PARTNER_TAG).trim() : '';
  const endpoint =
    e.AMAZON_CREATORS_ENDPOINT != null && String(e.AMAZON_CREATORS_ENDPOINT).trim()
      ? String(e.AMAZON_CREATORS_ENDPOINT).trim()
      : 'https://api.amazon.com/creators/v1/search';
  return { credential, partnerTag, endpoint };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertCreatorsCreds(env) {
  const c = readCreatorsCreds(env);
  const missing = [];
  if (!c.credential) missing.push('AMAZON_CREATORS_CREDENTIAL');
  if (!c.partnerTag) missing.push('AMAZON_PARTNER_TAG');
  if (missing.length) {
    throw new AmazonCreatorsCredsError(
      `Amazon Creators credentials missing: ${missing.join(', ')}. Set placeholders in providers/live/amazon/.env (never commit real secrets).`,
    );
  }
  return c;
}

/**
 * Build Creators search request (recorded-fixture friendly).
 */
function buildCreatorsSearchRequest(msg, creds) {
  const keywords = keywordsFromMsg(msg);
  const body = JSON.stringify({
    keywords: keywords || ' ',
    partnerTag: creds.partnerTag,
    marketplace: 'UK',
    pageSize: 10,
  });
  return {
    method: 'POST',
    url: creds.endpoint,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${creds.credential}`,
      accept: 'application/json',
    },
    body,
  };
}

/**
 * Normalize Creators fixture/response items -> a-search products[].
 * Accepts either { items: [...] } or { results: [...] }.
 *
 * @param {object} json
 * @param {{ userId: string, env?: string, envVars: Record<string, string|undefined> }} [track]
 * @returns {object[]}
 */
function normalizeCreatorsResponse(json, track) {
  const list =
    json && Array.isArray(json.items)
      ? json.items
      : json && Array.isArray(json.results)
        ? json.results
        : [];
  return list.map((item) => normalizeCreatorsItem(item, track));
}

/**
 * @param {object} item
 * @param {{ userId: string, env?: string, envVars: Record<string, string|undefined> }} [track]
 */
function normalizeCreatorsItem(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'amazon' });
    assertProductSchema(empty);
    return empty;
  }
  const id = item.asin != null ? String(item.asin) : item.id != null ? String(item.id) : '';
  const title = item.title != null ? String(item.title) : '';
  const imageUrl = item.imageUrl != null ? String(item.imageUrl) : undefined;
  const price = item.price != null ? Number(item.price) : undefined;
  const currency = item.currency != null ? String(item.currency) : undefined;

  let url;
  const detail = item.detailPageUrl != null ? String(item.detailPageUrl).trim() : '';
  if (detail) {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'amazon Creators normalize requires track context { userId, envVars }',
        'tracked_url_missing_userId',
      );
    }
    url = stampAmazonTrackedUrl({
      url: detail,
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
    });
  }

  const product = normalizeProduct({
    id,
    title,
    url,
    imageUrl,
    price: Number.isFinite(price) ? price : undefined,
    currency,
    source: 'amazon',
  });
  assertProductSchema(product);
  return product;
}

async function defaultCreatorsHttpRequest(req) {
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Amazon Creators non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    const err = new Error(`Amazon Creators HTTP ${res.status}: ${text.slice(0, 200)}`);
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
 *   httpRequest?: (req: object) => Promise<object>,
 * }} [deps]
 * @returns {Promise<object[]>} products
 */
async function searchAmazonCreators(msg, deps) {
  const env = (deps && deps.env) || process.env;
  const creds = assertCreatorsCreds(env);
  const request = buildCreatorsSearchRequest(msg, creds);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultCreatorsHttpRequest;
  const json = await httpRequest(request);
  return normalizeCreatorsResponse(json, {
    userId: msg && msg.userId,
    env: msg && msg.env,
    envVars: env,
  });
}

module.exports = {
  stampAmazonTrackedUrl,
  searchAmazonCreators,
  isCreatorsSearchEnabled,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
  buildCreatorsSearchRequest,
  normalizeCreatorsResponse,
  readCreatorsCreds,
};
