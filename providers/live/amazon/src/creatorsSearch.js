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
const DEFAULT_GET_ITEMS_ENDPOINT =
  'https://creatorsapi.amazon/catalog/v1/getItems';
const DEFAULT_TOKEN_URL_EU = 'https://api.amazon.co.uk/auth/o2/token';
const DEFAULT_TOKEN_URL_NA = 'https://api.amazon.com/auth/o2/token';
const DEFAULT_MARKETPLACE = 'www.amazon.co.uk';
const CREATORS_SCOPE = 'creatorsapi::default';
const TOKEN_SKEW_MS = 60_000;
const GET_ITEMS_BATCH = 10;
/** Resources shared by searchItems + getItems (madeira paapi.js parity, FR #4807). */
const CREATORS_ITEM_RESOURCES = [
  'images.primary.medium',
  'itemInfo.title',
  'offersV2.listings.price',
  'itemInfo.byLineInfo',
];

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
  // FR #4816: madeira paapi.js hard-codes www.amazon.co.uk. Do not derive
  // marketplace from AMAZON_HOST (PA-API leftover).
  return DEFAULT_MARKETPLACE;
}

function resolveCreatorsTokenUrl(env) {
  const e = env || {};
  const explicit =
    e.AMAZON_CREATORS_TOKEN_URL != null
      ? String(e.AMAZON_CREATORS_TOKEN_URL).trim()
      : '';
  if (explicit) return explicit;
  // FR #4816: madeira always POSTs api.amazon.co.uk. Do not derive from
  // AMAZON_REGION / AMAZON_HOST (PA-API leftovers).
  return DEFAULT_TOKEN_URL_EU;
}

/**
 * madeira: replace * with space and collapse whitespace.
 * @param {string} raw
 * @returns {string}
 */
function cleanCreatorsKeywords(raw) {
  return String(raw || '')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function creatorsMaxPages(env) {
  const n = parseInt(String((env && env.PAAPI_MAX_PAGES) || '5'), 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
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
  const partnerTagRaw =
    e.AMAZON_PARTNER_TAG != null
      ? String(e.AMAZON_PARTNER_TAG).trim()
      : e.AMAZON_ASSOCIATE_TAG != null
        ? String(e.AMAZON_ASSOCIATE_TAG).trim()
        : '';
  const partnerTag = partnerTagRaw;
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
    credential: '',
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
  if (!c.accessKey) missing.push('AMAZON_ACCESS_KEY');
  if (!c.secretKey) missing.push('AMAZON_SECRET_KEY');
  if (missing.length) {
    throw new AmazonCreatorsCredsError(
      `Amazon Creators credentials missing: ${missing.join(', ')}. Set AMAZON_ACCESS_KEY + AMAZON_SECRET_KEY (LwA) and AMAZON_PARTNER_TAG or AMAZON_ASSOCIATE_TAG (madeira /madeira/amazon/*; never commit real secrets).`,
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
function resolveGetItemsEndpoint(searchEndpoint) {
  const ep = String(searchEndpoint || DEFAULT_CREATORS_ENDPOINT).trim();
  if (/\/searchItems\/?$/i.test(ep)) {
    return ep.replace(/\/searchItems\/?$/i, '/getItems');
  }
  return DEFAULT_GET_ITEMS_ENDPOINT;
}

function buildCreatorsSearchRequest(msg, creds) {
  const keywords = cleanCreatorsKeywords(keywordsFromMsg(msg));
  const accessToken = String(
    creds.accessToken || creds.credential || '',
  ).trim();
  const marketplace = creds.marketplace || DEFAULT_MARKETPLACE;
  const body = JSON.stringify({
    keywords: keywords || ' ',
    partnerTag: creds.partnerTag,
    marketplace,
    itemPage: creds.itemPage != null ? Number(creds.itemPage) || 1 : 1,
    resources: CREATORS_ITEM_RESOURCES.slice(),
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

/**
 * madeira paapi.js GetItems body (asinList) — credentials proven on that shape.
 * @param {string[]} asins
 * @param {object} creds
 */
function buildCreatorsGetItemsRequest(asins, creds) {
  const accessToken = String(
    creds.accessToken || creds.credential || '',
  ).trim();
  const marketplace = creds.marketplace || DEFAULT_MARKETPLACE;
  const endpoint =
    creds.getItemsEndpoint || resolveGetItemsEndpoint(creds.endpoint);
  const body = JSON.stringify({
    asinList: asins,
    partnerTag: creds.partnerTag,
    marketplace,
    resources: CREATORS_ITEM_RESOURCES.slice(),
  });
  return {
    method: 'POST',
    url: endpoint,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json',
      'x-marketplace': marketplace,
    },
    body,
  };
}

/**
 * Absolute /dp/ASIN URL for a marketplace host (madeira builds affiliate_url
 * from ASIN when Creators omits detailPageURL).
 * @param {string} asin
 * @param {string} [marketplace]
 * @returns {string}
 */
function detailUrlForAsin(asin, marketplace) {
  const id = String(asin || '').trim();
  if (!id) return '';
  const host = String(marketplace || DEFAULT_MARKETPLACE)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  return `https://${host || DEFAULT_MARKETPLACE}/dp/${id}`;
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
  // Prefer medium (madeira / Creators sample) then small / bare url.
  if (primary && primary.medium && primary.medium.url) {
    return String(primary.medium.url);
  }
  if (primary && primary.small && primary.small.url) {
    return String(primary.small.url);
  }
  if (primary && primary.large && primary.large.url) {
    return String(primary.large.url);
  }
  if (primary && primary.url) return String(primary.url);
  return undefined;
}

/**
 * Parse Creators/PA money: prefer numeric amount, else displayAmount ("£29.99").
 * @param {object|null|undefined} money
 * @returns {{ price: number|undefined, currency: string|undefined }}
 */
function moneyFields(money) {
  if (!money || typeof money !== 'object') {
    return { price: undefined, currency: undefined };
  }
  const currency =
    money.currency != null ? String(money.currency) : undefined;
  if (money.amount != null && String(money.amount).trim() !== '') {
    const n = Number(money.amount);
    if (Number.isFinite(n)) return { price: n, currency };
  }
  if (money.displayAmount != null) {
    const raw = String(money.displayAmount).trim();
    // UK/US style: strip currency letters/symbols; keep digits and one dot.
    // MRB #4809: bare currency text (e.g. "GBP") must not become price 0 via Number("").
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!cleaned || !/[0-9]/.test(cleaned)) {
      return { price: undefined, currency };
    }
    const n = Number(cleaned);
    if (Number.isFinite(n)) return { price: n, currency };
  }
  return { price: undefined, currency };
}

function pickPrice(item) {
  if (!item || typeof item !== 'object') {
    return { price: undefined, currency: undefined };
  }
  if (item.forcedPrice != null && typeof item.forcedPrice !== 'object') {
    const n = Number(item.forcedPrice);
    if (Number.isFinite(n)) {
      return {
        price: n,
        currency: item.currency != null ? String(item.currency) : undefined,
      };
    }
    const fromDisplay = moneyFields({ displayAmount: item.forcedPrice });
    if (fromDisplay.price != null) {
      return {
        price: fromDisplay.price,
        currency:
          fromDisplay.currency ||
          (item.currency != null ? String(item.currency) : undefined),
      };
    }
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
  const parsed = moneyFields(money);
  if (parsed.price != null) return parsed;
  return {
    price: undefined,
    currency: item.currency != null ? String(item.currency) : undefined,
  };
}

function itemHasOfferPrice(item) {
  const { price } = pickPrice(item);
  return price != null && Number.isFinite(price);
}

/**
 * Merge GetItems offer/price onto searchItems rows missing price (madeira hybrid).
 * @param {object[]} items
 * @param {object} getJson
 */
function mergeGetItemsPrices(items, getJson) {
  const root = getJson && typeof getJson === 'object' ? getJson : {};
  const got =
    root.getItemsResult && Array.isArray(root.getItemsResult.items)
      ? root.getItemsResult.items
      : root.itemsResult && Array.isArray(root.itemsResult.items)
        ? root.itemsResult.items
        : Array.isArray(root.items)
          ? root.items
          : [];
  for (const getItem of got) {
    if (!getItem || getItem.asin == null) continue;
    const asin = String(getItem.asin);
    const original = items.find(
      (i) => i && i.asin != null && String(i.asin) === asin,
    );
    if (!original) continue;
    const { price, currency } = pickPrice(getItem);
    if (price != null && Number.isFinite(price)) {
      original.forcedPrice = price;
      if (currency) original.currency = currency;
    }
    if (
      getItem.offersV2 &&
      (!original.offersV2 || !itemHasOfferPrice(original))
    ) {
      original.offersV2 = getItem.offersV2;
    }
    if (!original.detailPageURL && !original.detailPageUrl && getItem.detailPageURL) {
      original.detailPageURL = getItem.detailPageURL;
    }
  }
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
  let detail = String(
    item.detailPageURL || item.detailPageUrl || item.url || item.link || '',
  ).trim();
  // madeira paapi.js always builds https://{marketplace}/dp/{asin}?tag=...
  // when Creators omits detailPageURL (FR #4807).
  if (!detail && id) {
    const marketplace =
      (track &&
        track.envVars &&
        resolveCreatorsMarketplace(track.envVars)) ||
      DEFAULT_MARKETPLACE;
    detail = detailUrlForAsin(id, marketplace);
  }
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
/**
 * After searchItems, force prices via GetItems for ASINs missing offer data
 * (madeira-sqs-affiliate/routes/paapi.js hybrid — FR #4807).
 * @param {object[]} items
 * @param {object} creds
 * @param {(req: object) => Promise<object>} httpRequest
 */
async function enrichCreatorsPricesViaGetItems(items, creds, httpRequest) {
  if (!Array.isArray(items) || items.length === 0) return;
  const need = items.filter(
    (item) =>
      item &&
      item.asin != null &&
      String(item.asin).trim() !== '' &&
      !itemHasOfferPrice(item),
  );
  if (need.length === 0) return;

  for (let i = 0; i < need.length; i += GET_ITEMS_BATCH) {
    const batch = need.slice(i, i + GET_ITEMS_BATCH).map((it) => String(it.asin));
    try {
      const req = buildCreatorsGetItemsRequest(batch, creds);
      const json = await httpRequest(req);
      mergeGetItemsPrices(items, json);
    } catch {
      // madeira logs and continues; searchItems rows still usable without price
    }
  }
}

function extractCreatorsItemList(json) {
  const root = json && typeof json === 'object' ? json : {};
  if (root.searchResult && Array.isArray(root.searchResult.items)) {
    return root.searchResult.items;
  }
  if (root.itemsResult && Array.isArray(root.itemsResult.items)) {
    return root.itemsResult.items;
  }
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.results)) return root.results;
  return [];
}

function logCreatorsNon2xx(shape) {
  const payload = {
    tokenUrl: shape.tokenUrl,
    endpoint: shape.endpoint,
    marketplace: shape.marketplace,
    partnerTag: shape.partnerTag,
    bearerSource: shape.bearerSource,
    status: shape.status,
  };
  console.error('[a-search] amazon creators fault', JSON.stringify(payload));
}

async function searchAmazonCreators(msg, deps) {
  const env = (deps && deps.env) || process.env;
  const creds = assertCreatorsCreds(env);
  const httpRequest =
    deps && typeof deps.httpRequest === 'function'
      ? deps.httpRequest
      : defaultCreatorsHttpRequest;
  const sleep =
    deps && typeof deps.sleep === 'function'
      ? deps.sleep
      : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let bearerSource = 'lwa';
  let accessToken =
    deps && deps.creatorsCredential
      ? String(deps.creatorsCredential).trim()
      : '';
  if (accessToken) bearerSource = 'override';
  if (!accessToken) {
    accessToken = await mintCreatorsAccessToken(creds, httpRequest);
    bearerSource = 'lwa';
  }

  const credsWithToken = {
    ...creds,
    accessToken,
    getItemsEndpoint: resolveGetItemsEndpoint(creds.endpoint),
  };

  const wrapHttp = async (req) => {
    try {
      return await httpRequest(req);
    } catch (err) {
      const status =
        err && (err.status != null || err.statusCode != null)
          ? err.status != null
            ? err.status
            : err.statusCode
          : undefined;
      logCreatorsNon2xx({
        tokenUrl: creds.tokenUrl,
        endpoint: creds.endpoint,
        marketplace: creds.marketplace,
        partnerTag: creds.partnerTag,
        bearerSource,
        status,
      });
      throw err;
    }
  };

  const allItems = [];
  const maxPages = creatorsMaxPages(env);
  for (let page = 1; page <= maxPages; ) {
    const request = buildCreatorsSearchRequest(msg, {
      ...credsWithToken,
      itemPage: page,
    });
    try {
      const json = await wrapHttp(request);
      const items = extractCreatorsItemList(json);
      allItems.push(...items);
      if (items.length < 10) break;
      page += 1;
      if (page <= maxPages) await sleep(1100);
    } catch (err) {
      const status = err && err.status != null ? err.status : err && err.statusCode;
      if (status === 429) {
        await sleep(2000);
        continue;
      }
      if (status === 401) {
        clearCreatorsTokenCache();
      }
      throw err;
    }
  }

  if (allItems.length) {
    await enrichCreatorsPricesViaGetItems(allItems, credsWithToken, wrapHttp);
  }

  return normalizeCreatorsResponse(
    { searchResult: { items: allItems } },
    {
      userId: msg && msg.userId,
      env: msg && msg.env,
      envVars: env,
    },
  );
}

module.exports = {
  stampAmazonTrackedUrl,
  searchAmazonCreators,
  isCreatorsSearchEnabled,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
  AmazonCreatorsHttpError,
  buildCreatorsSearchRequest,
  buildCreatorsGetItemsRequest,
  normalizeCreatorsResponse,
  readCreatorsCreds,
  mintCreatorsAccessToken,
  resolveCreatorsTokenUrl,
  resolveCreatorsMarketplace,
  resolveGetItemsEndpoint,
  clearCreatorsTokenCache,
  classifyCreatorsHttpFault,
  pickPrice,
  pickImage,
  detailUrlForAsin,
  moneyFields,
  mergeGetItemsPrices,
  DEFAULT_CREATORS_ENDPOINT,
  DEFAULT_GET_ITEMS_ENDPOINT,
  DEFAULT_TOKEN_URL_EU,
  CREATORS_ITEM_RESOURCES,
  cleanCreatorsKeywords,
};
