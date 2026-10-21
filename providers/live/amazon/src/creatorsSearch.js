'use strict';

/**
 * Amazon Associates Creators API search client (FR-182 / FR #4562 / FR #4721).
 *
 * Deploy mints a Login-with-Amazon (LwA) access token via client_credentials
 * using AMAZON_ACCESS_KEY + AMAZON_SECRET_KEY (SSM /madeira/amazon/access-key
 * + secret-key), then POSTs https://creatorsapi.amazon/catalog/v1/searchItems
 * with Bearer + x-marketplace (UK: www.amazon.co.uk). Optional
 * AMAZON_CREATORS_CREDENTIAL overrides the bearer for fixtures only.
 * HTTP is injectable for recorded fixtures (no live network in pins).
 */

const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const { TrackedUrlError } = require('../../../../shared/links/buildTrackedUrl');
const { stampAmazonTrackedUrl } = require('./stampAmazonTrackedUrl');
const { keywordsFromMsg } = require('./search');

const DEFAULT_CREATORS_ENDPOINT =
  'https://creatorsapi.amazon/catalog/v1/searchItems';
const DEFAULT_TOKEN_URL_EU = 'https://api.amazon.co.uk/auth/o2/token';
const DEFAULT_TOKEN_URL_NA = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_MARKETPLACE = 'www.amazon.co.uk';
const CREATORS_SCOPE = 'creatorsapi::default';
const TOKEN_SKEW_MS = 60_000;

/** @type {{ accessToken: string, expiresAt: number }} */
let _tokenCache = { accessToken: '', expiresAt: 0 };

class AmazonCreatorsCredsError extends Error {
  constructor(message) {
    super(message || 'amazon_creators_missing_credentials');
    this.name = 'AmazonCreatorsCredsError';
    this.code = 'amazon_creators_missing_credentials';
  }
}

class AmazonCreatorsHttpError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'AmazonCreatorsHttpError';
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

/**
 * Feature flag (FR-181 / FR-182 / FR #4562).
 * Default **on** (Creators) when AMAZON_SEARCH_API is unset - PA-API 5 returns
 * HTML 503s in production. Explicit `paapi` or AMAZON_CREATORS_ENABLED=false
 * keeps the old path.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean}
 */
function isCreatorsSearchEnabled(env) {
  const e = env || process.env;
  const flag =
    e.AMAZON_CREATORS_ENABLED != null
      ? String(e.AMAZON_CREATORS_ENABLED).trim().toLowerCase()
      : '';
  if (flag === '0' || flag === 'false' || flag === 'no' || flag === 'off') {
    return false;
  }
  const api =
    e.AMAZON_SEARCH_API != null
      ? String(e.AMAZON_SEARCH_API).trim().toLowerCase()
      : '';
  if (api === 'paapi' || api === 'pa-api' || api === 'paapi5') return false;
  if (api === 'creators' || api === 'creators_api' || api === 'creator') {
    return true;
  }
  if (flag === '1' || flag === 'true' || flag === 'yes' || flag === 'on') {
    return true;
  }
  // FR #4562: unset / empty defaults to Creators.
  return true;
}

function clearCreatorsTokenCache() {
  _tokenCache = { accessToken: '', expiresAt: 0 };
}

function resolveCreatorsMarketplace(env) {
  const e = env || {};
  const explicit =
    e.AMAZON_CREATORS_MARKETPLACE != null
      ? String(e.AMAZON_CREATORS_MARKETPLACE).trim()
      : '';
  if (explicit) return explicit;
  const host = e.AMAZON_HOST != null ? String(e.AMAZON_HOST).toLowerCase() : '';
  if (host.includes('amazon.com') && !host.includes('amazon.co.uk')) {
    return 'www.amazon.com';
  }
  if (host.includes('amazon.de')) return 'www.amazon.de';
  if (host.includes('amazon.fr')) return 'www.amazon.fr';
  return DEFAULT_MARKETPLACE;
}

function resolveCreatorsTokenUrl(env) {
  const e = env || {};
  const explicit =
    e.AMAZON_CREATORS_TOKEN_URL != null
      ? String(e.AMAZON_CREATORS_TOKEN_URL).trim()
      : '';
  if (explicit) return explicit;
  const region =
    e.AMAZON_REGION != null ? String(e.AMAZON_REGION).toLowerCase() : '';
  const host = e.AMAZON_HOST != null ? String(e.AMAZON_HOST).toLowerCase() : '';
  if (
    region.startsWith('us-') ||
    (host.includes('amazon.com') && !host.includes('amazon.co.uk'))
  ) {
    return DEFAULT_TOKEN_URL_NA;
  }
  return DEFAULT_TOKEN_URL_EU;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function readCreatorsCreds(env) {
  const e = env || process.env;
  const accessKey =
    e.AMAZON_ACCESS_KEY != null ? String(e.AMAZON_ACCESS_KEY).trim() : '';
  const secretKey =
    e.AMAZON_SECRET_KEY != null ? String(e.AMAZON_SECRET_KEY).trim() : '';
  const credential =
    e.AMAZON_CREATORS_CREDENTIAL != null
      ? String(e.AMAZON_CREATORS_CREDENTIAL).trim()
      : '';
  const partnerTag =
    e.AMAZON_PARTNER_TAG != null ? String(e.AMAZON_PARTNER_TAG).trim() : '';
  const endpoint =
    e.AMAZON_CREATORS_ENDPOINT != null &&
    String(e.AMAZON_CREATORS_ENDPOINT).trim()
      ? String(e.AMAZON_CREATORS_ENDPOINT).trim()
      : DEFAULT_CREATORS_ENDPOINT;
  const marketplace = resolveCreatorsMarketplace(e);
  const tokenUrl = resolveCreatorsTokenUrl(e);
  return {
    accessKey,
    secretKey,
    credential,
    partnerTag,
    endpoint,
    marketplace,
    tokenUrl,
  };
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function assertCreatorsCreds(env) {
  const c = readCreatorsCreds(env);
  const missing = [];
  if (!c.partnerTag) missing.push('AMAZON_PARTNER_TAG');
  if (!c.credential && (!c.accessKey || !c.secretKey)) {
    if (!c.accessKey) missing.push('AMAZON_ACCESS_KEY');
    if (!c.secretKey) missing.push('AMAZON_SECRET_KEY');
    if (!c.credential) missing.push('AMAZON_CREATORS_CREDENTIAL');
  }
  if (missing.length) {
    throw new AmazonCreatorsCredsError(
      `Amazon Creators credentials missing: ${missing.join(', ')}. Set AMAZON_ACCESS_KEY + AMAZON_SECRET_KEY (LwA) or AMAZON_CREATORS_CREDENTIAL override in providers/live/amazon/.env (never commit real secrets).`,
    );
  }
  return c;
}

/**
 * @param {object} creds - readCreatorsCreds result
 * @param {(req: object) => Promise<object>} httpRequest
 * @returns {Promise<string>}
 */
async function mintCreatorsAccessToken(creds, httpRequest) {
  if (
    _tokenCache.accessToken &&
    Date.now() < _tokenCache.expiresAt - TOKEN_SKEW_MS
  ) {
    return _tokenCache.accessToken;
  }

  const body = JSON.stringify({
    grant_type: 'client_credentials',
    client_id: creds.accessKey,
    client_secret: creds.secretKey,
    scope: CREATORS_SCOPE,
  });

  let payload;
  try {
    payload = await httpRequest({
      method: 'POST',
      url: creds.tokenUrl,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body,
    });
  } catch (err) {
    const status =
      err && (err.statusCode != null || err.status != null)
        ? err.statusCode != null
          ? err.statusCode
          : err.status
        : undefined;
    throw new AmazonCreatorsHttpError(
      `Amazon Creators token request failed${status ? ` (HTTP ${status})` : ''}`,
      status,
    );
  }

  const accessToken = String(
    (payload && (payload.access_token || payload.accessToken)) || '',
  ).trim();
  if (!accessToken) {
    throw new AmazonCreatorsHttpError(
      'Amazon Creators token response missing access_token',
      undefined,
    );
  }
  const expiresIn = Number(
    (payload && (payload.expires_in || payload.expiresIn)) || 3600,
  );
  _tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000,
  };
  return accessToken;
}

/**
 * Build Creators searchItems request (recorded-fixture friendly).
 * @param {object} msg
 * @param {object} creds - readCreatorsCreds + accessToken (or credential)
 */
function buildCreatorsSearchRequest(msg, creds) {
  const keywords = keywordsFromMsg(msg);
  const accessToken = String(
    creds.accessToken || creds.credential || '',
  ).trim();
  const marketplace = creds.marketplace || DEFAULT_MARKETPLACE;
  const body = JSON.stringify({
    keywords: keywords || ' ',
    partnerTag: creds.partnerTag,
    marketplace,
    resources: [
      'images.primary.small',
      'itemInfo.title',
      'offersV2.listings.price',
    ],
  });
  return {
    method: 'POST',
    url: creds.endpoint,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'x-marketplace': marketplace,
    },
    body,
  };
}

function pickTitle(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.title != null && typeof item.title === 'string') {
    return String(item.title);
  }
  const nested =
    item.itemInfo &&
    item.itemInfo.title &&
    (item.itemInfo.title.displayValue || item.itemInfo.title);
  if (typeof nested === 'string') return nested;
  return '';
}

function pickImage(item) {
  if (!item || typeof item !== 'object') return undefined;
  if (item.imageUrl != null) return String(item.imageUrl);
  const primary = item.images && item.images.primary;
  if (primary && primary.small && primary.small.url) {
    return String(primary.small.url);
  }
  if (primary && primary.medium && primary.medium.url) {
    return String(primary.medium.url);
  }
  if (primary && primary.url) return String(primary.url);
  return undefined;
}

function pickPrice(item) {
  if (!item || typeof item !== 'object') {
    return { price: undefined, currency: undefined };
  }
  if (item.price != null && typeof item.price !== 'object') {
    return {
      price: Number(item.price),
      currency: item.currency != null ? String(item.currency) : undefined,
    };
  }
  const listing =
    item.offersV2 &&
    Array.isArray(item.offersV2.listings) &&
    item.offersV2.listings[0];
  const money =
    listing && listing.price && (listing.price.money || listing.price);
  if (money && money.amount != null) {
    return {
      price: Number(money.amount),
      currency: money.currency != null ? String(money.currency) : undefined,
    };
  }
  return {
    price: undefined,
    currency: item.currency != null ? String(item.currency) : undefined,
  };
}

/**
 * Normalize Creators fixture/response items -> a-search products[].
 * Accepts searchResult.items, itemsResult.items, items, or results.
 *
 * @param {object} json
 * @param {{ userId: string, env?: string, envVars: Record<string, string|undefined> }} [track]
 * @returns {object[]}
 */
function normalizeCreatorsResponse(json, track) {
  const root = json && typeof json === 'object' ? json : {};
  const list =
    root.searchResult && Array.isArray(root.searchResult.items)
      ? root.searchResult.items
      : root.itemsResult && Array.isArray(root.itemsResult.items)
        ? root.itemsResult.items
        : Array.isArray(root.items)
          ? root.items
          : Array.isArray(root.results)
            ? root.results
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
  const id =
    item.asin != null
      ? String(item.asin)
      : item.id != null
        ? String(item.id)
        : '';
  const title = pickTitle(item);
  const imageUrl = pickImage(item);
  const { price, currency } = pickPrice(item);

  let url;
  const detail = String(
    item.detailPageURL || item.detailPageUrl || item.url || item.link || '',
  ).trim();
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

/**
 * FR #4739: permanent Creators account faults (do not DLQ / intake-fatal).
 * @param {number} status
 * @param {object|null|undefined} json
 * @param {string} [text]
 * @returns {string|null} fault code or null
 */
function classifyCreatorsHttpFault(status, json, text) {
  const body = json && typeof json === 'object' ? json : {};
  const reason = String(body.reason || '').trim();
  const type = String(body.type || body.__type || '').trim();
  const msg = String(body.message || text || '');
  if (
    /AssociateNotEligible/i.test(reason) ||
    /AssociateNotEligible/i.test(msg) ||
    (/AccessDenied/i.test(type) && /eligib/i.test(msg))
  ) {
    return 'creators_not_eligible';
  }
  // Only tag when the body names eligibility; bare 403 stays hard fail.
  void status;
  return null;
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
    // FR #4427 / #4562: same status attach as PA-API non-JSON path
    // (non-retryable; FR #4769 fail into DLQ, no status IN).
    const err = new Error(`Amazon Creators non-JSON response (${res.status})`);
    err.status = res.status;
    err.code = 'creators_non_json';
    err.bodyText = String(text || '').slice(0, 200);
    throw err;
  }
  if (!res.ok) {
    const err = new Error(
      `Amazon Creators HTTP ${res.status}: ${text.slice(0, 200)}`,
    );
    err.status = res.status;
    err.body = json;
    const fault = classifyCreatorsHttpFault(res.status, json, text);
    if (fault) {
      err.code = fault;
      err.nonRetryable = true;
    }
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
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultCreatorsHttpRequest;

  let accessToken = creds.credential;
  if (!accessToken) {
    accessToken = await mintCreatorsAccessToken(creds, httpRequest);
  }

  const request = buildCreatorsSearchRequest(msg, {
    ...creds,
    accessToken,
  });
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
  AmazonCreatorsHttpError,
  buildCreatorsSearchRequest,
  normalizeCreatorsResponse,
  readCreatorsCreds,
  mintCreatorsAccessToken,
  resolveCreatorsTokenUrl,
  resolveCreatorsMarketplace,
  clearCreatorsTokenCache,
  classifyCreatorsHttpFault,
  DEFAULT_CREATORS_ENDPOINT,
  DEFAULT_TOKEN_URL_EU,
};
