'use strict';

/**
 * Normalize Skimlinks product-search payloads → a-search product schema (FR-068).
 * Stay-dark: do not enable registry. search.js / worker wiring are out of scope.
 *
 * Field map (recorded fixture + common API aliases):
 * - `id` / `product_id` → `id`
 * - `title` / `name` → `title`
 * - `url` / `deep_link` / `click_url` → `url` via `buildTrackedUrl` + `SKIMLINKS_PUBLISHER_ID`
 * - `image` / `image_url` / `imageUrl` → `imageUrl`
 * - `price` / `currency` → `price` / `currency`
 * - `merchant` / `merchant_name` → `description` (optional)
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
      : item.deep_link != null
        ? String(item.deep_link)
        : item.click_url != null
          ? String(item.click_url)
          : item.link != null
            ? String(item.link)
            : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'skimlinks normalize requires track context { userId, envVars } for product url',
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

  const id =
    item.id != null
      ? String(item.id)
      : item.product_id != null
        ? String(item.product_id)
        : '';
  const title =
    item.title != null
      ? String(item.title)
      : item.name != null
        ? String(item.name)
        : '';

  const imageRaw =
    item.imageUrl != null
      ? item.imageUrl
      : item.image_url != null
        ? item.image_url
        : item.image != null
          ? item.image
          : undefined;

  const merchant =
    item.merchant != null
      ? item.merchant
      : item.merchant_name != null
        ? item.merchant_name
        : undefined;

  const product = normalizeProduct({
    id,
    title,
    url,
    imageUrl:
      imageRaw != null && String(imageRaw).trim() !== ''
        ? String(imageRaw)
        : undefined,
    price: item.price != null ? Number(item.price) : undefined,
    currency:
      item.currency != null && String(item.currency).trim() !== ''
        ? String(item.currency)
        : undefined,
    description:
      merchant != null && String(merchant).trim() !== ''
        ? String(merchant)
        : undefined,
    source: 'skimlinks',
  });
  assertProductSchema(product);
  return product;
}

/**
 * Extract product list from a Skimlinks search JSON body.
 * @param {object} body
 * @returns {object[]}
 */
function productsFromBody(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.products)) return body.products;
  if (
    body.skimlinksProduct &&
    Array.isArray(body.skimlinksProduct.products)
  ) {
    return body.skimlinksProduct.products;
  }
  if (Array.isArray(body.items)) return body.items;
  return [];
}

/**
 * Map a Skimlinks product-search JSON body to products.
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
        : item.product_id != null
          ? String(item.product_id).trim()
          : '';
    const title =
      item.title != null
        ? String(item.title).trim()
        : item.name != null
          ? String(item.name).trim()
          : '';
    if (!id || !title) continue;
    out.push(normalizeSkimlinksProduct(item, track));
  }
  return out;
}

module.exports = {
  normalizeSkimlinksProduct,
  normalizeSearchResponse,
  productsFromBody,
  TrackedUrlError,
};
