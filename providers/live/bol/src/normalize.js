'use strict';

/**
 * Normalize Bol catalog/search payloads → a-search products (FR-080).
 * Stay-dark: do not enable registry. search.js / worker wiring are out of scope
 * for this FR (search may already be present from FR-079).
 *
 * Field map:
 * - `id` / `ean` / `productId` → `id`
 * - `title` / `name` → `title`
 * - `url` / `productUrl` → `url` via buildTrackedUrl + BOL_TRACKING_ID
 * - `imageUrl` / `image_url` / `image` → `imageUrl`
 * - `offerPrice` / `price` → `price` (major units)
 * - `currency` → `currency`
 * - `seller` / `description` → `description`
 */

const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');
const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');

/**
 * @param {unknown} raw
 * @returns {number|undefined}
 */
function coercePrice(raw) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * @param {object} item
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeBolProduct(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'bol' });
    assertProductSchema(empty);
    return empty;
  }

  const rawUrl =
    item.url != null
      ? String(item.url)
      : item.productUrl != null
        ? String(item.productUrl)
        : item.product_url != null
          ? String(item.product_url)
          : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'bol normalize requires track context { userId, envVars } for product url',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['BOL_TRACKING_ID'],
    });
  }

  const imageRaw =
    item.imageUrl != null
      ? item.imageUrl
      : item.image_url != null
        ? item.image_url
        : item.image != null
          ? item.image
          : undefined;

  const priceRaw =
    item.offerPrice != null
      ? item.offerPrice
      : item.price != null
        ? item.price
        : item.salePrice != null
          ? item.salePrice
          : undefined;

  const product = normalizeProduct({
    id:
      item.id != null
        ? String(item.id)
        : item.ean != null
          ? String(item.ean)
          : item.productId != null
            ? String(item.productId)
            : '',
    title:
      item.title != null
        ? String(item.title)
        : item.name != null
          ? String(item.name)
          : '',
    url,
    imageUrl:
      imageRaw != null && String(imageRaw).trim() !== ''
        ? String(imageRaw)
        : undefined,
    price: coercePrice(priceRaw),
    currency:
      item.currency != null && String(item.currency).trim() !== ''
        ? String(item.currency)
        : undefined,
    description:
      item.description != null && String(item.description).trim() !== ''
        ? String(item.description)
        : item.seller != null && String(item.seller).trim() !== ''
          ? String(item.seller)
          : undefined,
    source: 'bol',
  });
  assertProductSchema(product);
  return product;
}

/**
 * @param {object} body
 * @returns {object[]}
 */
function productsFromBody(body) {
  if (!body || typeof body !== 'object') return [];
  if (body.bolProductAPI && Array.isArray(body.bolProductAPI.products)) {
    return body.bolProductAPI.products;
  }
  if (Array.isArray(body.products)) return body.products;
  if (Array.isArray(body.offers)) return body.offers;
  if (Array.isArray(body.results)) return body.results;
  return [];
}

/**
 * Map a Bol search JSON body to products.
 * Missing/partial rows (no id+title) are skipped (no throw). Empty → [].
 *
 * @param {object} searchBody
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(searchBody, track) {
  const items = productsFromBody(searchBody);
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id =
      item.id != null
        ? String(item.id).trim()
        : item.ean != null
          ? String(item.ean).trim()
          : item.productId != null
            ? String(item.productId).trim()
            : '';
    const title =
      item.title != null
        ? String(item.title).trim()
        : item.name != null
          ? String(item.name).trim()
          : '';
    if (!id || !title) continue;
    out.push(normalizeBolProduct(item, track));
  }
  return out;
}

module.exports = {
  normalizeBolProduct,
  normalizeSearchResponse,
  productsFromBody,
  coercePrice,
  TrackedUrlError,
};
