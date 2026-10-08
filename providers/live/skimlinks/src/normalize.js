'use strict';

/**
 * Normalize Skimlinks Product API payload → a-search products (FR-068/069).
 * When product url is present, stamps JWT userId + SKIMLINKS_PUBLISHER_ID
 * via buildTrackedUrl.
 *
 * Field map:
 * - `id` → `id`
 * - `title` → `title`
 * - `url` → tracked `url`
 * - `image_url` → `imageUrl`
 * - `price` (minor units, e.g. 89900 = 899.00) → `price`
 * - `currency` → `currency`
 * - `merchant` → `description`
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
function priceFromMinorUnits(raw) {
  if (raw == null || String(raw).trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return n / 100;
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
function normalizeSkimlinksProduct(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'skimlinks' });
    assertProductSchema(empty);
    return empty;
  }

  const rawUrl =
    item.url != null
      ? String(item.url)
      : item.clickUrl != null
        ? String(item.clickUrl)
        : item.link != null
          ? String(item.link)
          : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'skimlinks normalize requires track context { userId, envVars } for url',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['SKIMLINKS_PUBLISHER_ID'],
    });
  }

  const product = normalizeProduct({
    id: item.id != null ? String(item.id) : '',
    title: item.title == null ? '' : String(item.title),
    url,
    imageUrl:
      item.image_url != null && String(item.image_url).trim() !== ''
        ? String(item.image_url)
        : item.imageUrl != null && String(item.imageUrl).trim() !== ''
          ? String(item.imageUrl)
          : undefined,
    price: priceFromMinorUnits(item.price),
    currency:
      item.currency != null && String(item.currency).trim() !== ''
        ? String(item.currency)
        : undefined,
    description:
      item.merchant != null && String(item.merchant).trim() !== ''
        ? String(item.merchant)
        : undefined,
    source: 'skimlinks',
  });
  assertProductSchema(product);
  return product;
}

/**
 * @param {object} body - Product API JSON
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(body, track) {
  const products =
    body &&
    body.skimlinksProductAPI &&
    Array.isArray(body.skimlinksProductAPI.products)
      ? body.skimlinksProductAPI.products
      : Array.isArray(body && body.products)
        ? body.products
        : [];
  const out = [];
  for (const item of products) {
    if (!item || typeof item !== 'object') continue;
    const id = item.id != null ? String(item.id).trim() : '';
    const title = item.title != null ? String(item.title).trim() : '';
    if (!id || !title) continue;
    out.push(normalizeSkimlinksProduct(item, track));
  }
  return out;
}

module.exports = {
  normalizeSkimlinksProduct,
  normalizeSearchResponse,
  priceFromMinorUnits,
  TrackedUrlError,
};
