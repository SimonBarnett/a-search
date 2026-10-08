'use strict';

/**
 * Normalize AliExpress affiliate/product-search payloads → a-search products (FR-072).
 * Stay-dark: do not enable registry. search.js / worker wiring are out of scope.
 *
 * Field map (recorded fixture + common API aliases):
 * - `product_id` / `productId` / `id` → `id`
 * - `product_title` / `productTitle` / `title` / `name` → `title`
 * - `promotion_link` / `product_detail_url` / `url` → `url` via buildTrackedUrl + ALIEXPRESS_TRACKING_ID
 * - `product_main_image_url` / `image_url` / `image` → `imageUrl`
 * - `target_sale_price` / `sale_price` / `price` → `price` (major units)
 * - `target_sale_price_currency` / `currency` → `currency`
 * - `shop_name` / `store_name` / `merchant` → `description`
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
function normalizeAliexpressProduct(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'aliexpress' });
    assertProductSchema(empty);
    return empty;
  }

  const rawUrl =
    item.promotion_link != null
      ? String(item.promotion_link)
      : item.product_detail_url != null
        ? String(item.product_detail_url)
        : item.url != null
          ? String(item.url)
          : item.clickUrl != null
            ? String(item.clickUrl)
            : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'aliexpress normalize requires track context { userId, envVars } for product url',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['ALIEXPRESS_TRACKING_ID'],
    });
  }

  const id =
    item.product_id != null
      ? String(item.product_id)
      : item.productId != null
        ? String(item.productId)
        : item.id != null
          ? String(item.id)
          : '';
  const title =
    item.product_title != null
      ? String(item.product_title)
      : item.productTitle != null
        ? String(item.productTitle)
        : item.title != null
          ? String(item.title)
          : item.name != null
            ? String(item.name)
            : '';

  const imageRaw =
    item.product_main_image_url != null
      ? item.product_main_image_url
      : item.image_url != null
        ? item.image_url
        : item.imageUrl != null
          ? item.imageUrl
          : item.image != null
            ? item.image
            : undefined;

  const priceRaw =
    item.target_sale_price != null
      ? item.target_sale_price
      : item.sale_price != null
        ? item.sale_price
        : item.price != null
          ? item.price
          : undefined;

  const currencyRaw =
    item.target_sale_price_currency != null
      ? item.target_sale_price_currency
      : item.currency != null
        ? item.currency
        : undefined;

  const merchant =
    item.shop_name != null
      ? item.shop_name
      : item.store_name != null
        ? item.store_name
        : item.merchant != null
          ? item.merchant
          : undefined;

  const product = normalizeProduct({
    id,
    title,
    url,
    imageUrl:
      imageRaw != null && String(imageRaw).trim() !== ''
        ? String(imageRaw)
        : undefined,
    price: coercePrice(priceRaw),
    currency:
      currencyRaw != null && String(currencyRaw).trim() !== ''
        ? String(currencyRaw)
        : undefined,
    description:
      merchant != null && String(merchant).trim() !== ''
        ? String(merchant)
        : undefined,
    source: 'aliexpress',
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
  if (Array.isArray(body.products)) return body.products;
  if (body.result && Array.isArray(body.result.products)) {
    return body.result.products;
  }
  if (
    body.aliexpress_affiliate_product_query_response &&
    body.aliexpress_affiliate_product_query_response.resp_result &&
    body.aliexpress_affiliate_product_query_response.resp_result.result &&
    Array.isArray(
      body.aliexpress_affiliate_product_query_response.resp_result.result
        .products,
    )
  ) {
    return body.aliexpress_affiliate_product_query_response.resp_result.result
      .products;
  }
  if (Array.isArray(body.items)) return body.items;
  return [];
}

/**
 * Map an AliExpress product-search JSON body to products.
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
      item.product_id != null
        ? String(item.product_id).trim()
        : item.productId != null
          ? String(item.productId).trim()
          : item.id != null
            ? String(item.id).trim()
            : '';
    const title =
      item.product_title != null
        ? String(item.product_title).trim()
        : item.productTitle != null
          ? String(item.productTitle).trim()
          : item.title != null
            ? String(item.title).trim()
            : item.name != null
              ? String(item.name).trim()
              : '';
    if (!id || !title) continue;
    out.push(normalizeAliexpressProduct(item, track));
  }
  return out;
}

module.exports = {
  normalizeAliexpressProduct,
  normalizeSearchResponse,
  productsFromBody,
  coercePrice,
  TrackedUrlError,
};
