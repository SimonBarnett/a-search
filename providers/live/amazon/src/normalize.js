'use strict';

const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');

/**
 * @param {object} [track]
 * @returns {{ userId: string, env?: string, envVars: Record<string, string|undefined> }}
 */
function requireTrackContext(track) {
  if (!track || typeof track !== 'object') {
    throw new TrackedUrlError(
      'amazon normalize requires track context { userId, envVars } for DetailPageURL',
      'tracked_url_missing_userId',
    );
  }
  return track;
}

/**
 * Normalize Amazon PA-API SearchItems item → a-search product.
 * When DetailPageURL is present, stamps JWT userId tenant + AMAZON_PARTNER_TAG
 * via buildTrackedUrl (FR-057c).
 *
 * @param {object} item
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeAmazonItem(item, track) {
  if (!item || typeof item !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'amazon' });
    assertProductSchema(empty);
    return empty;
  }
  const listing =
    item.Offers &&
    item.Offers.Listings &&
    Array.isArray(item.Offers.Listings) &&
    item.Offers.Listings[0]
      ? item.Offers.Listings[0]
      : null;
  const priceObj = listing && listing.Price ? listing.Price : null;
  const title =
    item.ItemInfo && item.ItemInfo.Title
      ? item.ItemInfo.Title.DisplayValue
      : undefined;
  const imageUrl =
    item.Images &&
    item.Images.Primary &&
    item.Images.Primary.Large &&
    item.Images.Primary.Large.URL
      ? item.Images.Primary.Large.URL
      : undefined;

  let url;
  if (item.DetailPageURL != null && String(item.DetailPageURL).trim() !== '') {
    const ctx = requireTrackContext(track);
    url = buildTrackedUrl({
      url: String(item.DetailPageURL),
      userId: ctx.userId,
      env: ctx.env,
      envVars: ctx.envVars || {},
      requiredAccountKeys: ['AMAZON_PARTNER_TAG'],
    });
  }

  const product = normalizeProduct({
    id: item.ASIN != null ? String(item.ASIN) : '',
    title: title == null ? '' : String(title),
    url,
    imageUrl: imageUrl == null ? undefined : String(imageUrl),
    price:
      priceObj && priceObj.Amount != null ? Number(priceObj.Amount) : undefined,
    currency:
      priceObj && priceObj.Currency != null
        ? String(priceObj.Currency)
        : undefined,
    source: 'amazon',
  });
  assertProductSchema(product);
  return product;
}

/**
 * @param {object} paapiBody - SearchItems response JSON
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(paapiBody, track) {
  const items =
    paapiBody &&
    paapiBody.SearchResult &&
    Array.isArray(paapiBody.SearchResult.Items)
      ? paapiBody.SearchResult.Items
      : [];
  return items.map((item) => normalizeAmazonItem(item, track));
}

module.exports = {
  normalizeAmazonItem,
  normalizeSearchResponse,
  TrackedUrlError,
};
