'use strict';

/**
 * Normalize Etsy Open API listing payloads → a-search products (FR-076).
 * Stay-dark: do not enable registry. search.js / worker wiring are out of scope
 * for this FR (search may already be present from FR-075).
 *
 * Field map:
 * - `listing_id` / `id` → `id`
 * - `title` → `title`
 * - `url` / `url_full` → `url` via buildTrackedUrl + ETSY_TRACKING_ID
 * - `images[0].url_570xN` / `image_url` → `imageUrl`
 * - `price.amount` / `price.divisor` → `price` (major units)
 * - `price.currency_code` → `currency`
 * - `description` / `shop_name` → `description`
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
 * @param {unknown} priceObj
 * @returns {{ price?: number, currency?: string }}
 */
function coerceEtsyPrice(priceObj) {
  if (priceObj == null) return {};
  if (typeof priceObj === 'number' || typeof priceObj === 'string') {
    const n = Number(priceObj);
    return Number.isFinite(n) ? { price: n } : {};
  }
  if (typeof priceObj !== 'object') return {};
  const amount = Number(priceObj.amount);
  const divisor = Number(priceObj.divisor != null ? priceObj.divisor : 100);
  const currency =
    priceObj.currency_code != null
      ? String(priceObj.currency_code)
      : priceObj.currency != null
        ? String(priceObj.currency)
        : undefined;
  if (!Number.isFinite(amount) || !Number.isFinite(divisor) || divisor === 0) {
    return currency ? { currency } : {};
  }
  return { price: amount / divisor, currency };
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
function normalizeEtsyListing(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'etsy' });
    assertProductSchema(empty);
    return empty;
  }

  const rawUrl =
    item.url != null
      ? String(item.url)
      : item.url_full != null
        ? String(item.url_full)
        : item.listing_url != null
          ? String(item.listing_url)
          : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'etsy normalize requires track context { userId, envVars } for listing url',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['ETSY_TRACKING_ID'],
    });
  }

  let imageUrl;
  if (Array.isArray(item.images) && item.images[0]) {
    const img = item.images[0];
    imageUrl =
      img.url_570xN != null
        ? String(img.url_570xN)
        : img.url_fullxfull != null
          ? String(img.url_fullxfull)
          : img.url != null
            ? String(img.url)
            : undefined;
  } else if (item.image_url != null) {
    imageUrl = String(item.image_url);
  } else if (item.imageUrl != null) {
    imageUrl = String(item.imageUrl);
  }

  const { price, currency } = coerceEtsyPrice(item.price);

  const product = normalizeProduct({
    id:
      item.listing_id != null
        ? String(item.listing_id)
        : item.id != null
          ? String(item.id)
          : '',
    title: item.title == null ? '' : String(item.title),
    url,
    imageUrl:
      imageUrl != null && String(imageUrl).trim() !== ''
        ? String(imageUrl)
        : undefined,
    price,
    currency:
      currency != null && String(currency).trim() !== ''
        ? String(currency)
        : undefined,
    description:
      item.description != null && String(item.description).trim() !== ''
        ? String(item.description)
        : item.shop_name != null && String(item.shop_name).trim() !== ''
          ? String(item.shop_name)
          : undefined,
    source: 'etsy',
  });
  assertProductSchema(product);
  return product;
}

/**
 * @param {object} body
 * @returns {object[]}
 */
function listingsFromBody(body) {
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body.results)) return body.results;
  if (body.etsyProductAPI && Array.isArray(body.etsyProductAPI.results)) {
    return body.etsyProductAPI.results;
  }
  if (Array.isArray(body.listings)) return body.listings;
  if (Array.isArray(body.products)) return body.products;
  return [];
}

/**
 * Map an Etsy listing-search JSON body to products.
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
  const items = listingsFromBody(searchBody);
  const out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id =
      item.listing_id != null
        ? String(item.listing_id).trim()
        : item.id != null
          ? String(item.id).trim()
          : '';
    const title = item.title != null ? String(item.title).trim() : '';
    if (!id || !title) continue;
    out.push(normalizeEtsyListing(item, track));
  }
  return out;
}

module.exports = {
  normalizeEtsyListing,
  normalizeSearchResponse,
  listingsFromBody,
  coerceEtsyPrice,
  TrackedUrlError,
};
