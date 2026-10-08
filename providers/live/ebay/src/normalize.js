'use strict';

const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');

/**
 * Normalize eBay Browse API itemSummary → a-search product.
 * When itemWebUrl is present, stamps JWT userId tenant + EBAY_CAMPAIGN_ID
 * via buildTrackedUrl (FR-057e).
 *
 * @param {object} item
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeEbayItem(item, track) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'ebay' };
  }
  const priceObj = item.price && typeof item.price === 'object' ? item.price : null;
  const imageUrl =
    item.image && item.image.imageUrl != null
      ? String(item.image.imageUrl)
      : undefined;

  let url;
  if (item.itemWebUrl != null && String(item.itemWebUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'ebay normalize requires track context { userId, envVars } for itemWebUrl',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(item.itemWebUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['EBAY_CAMPAIGN_ID'],
    });
  }

  return {
    id: item.itemId != null ? String(item.itemId) : '',
    title: item.title == null ? '' : String(item.title),
    url,
    imageUrl,
    price:
      priceObj && priceObj.value != null ? Number(priceObj.value) : undefined,
    currency:
      priceObj && priceObj.currency != null
        ? String(priceObj.currency)
        : undefined,
    source: 'ebay',
  };
}

/**
 * @param {object} browseBody - item_summary/search response JSON
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(browseBody, track) {
  const items =
    browseBody && Array.isArray(browseBody.itemSummaries)
      ? browseBody.itemSummaries
      : [];
  return items.map((item) => normalizeEbayItem(item, track));
}

module.exports = {
  normalizeEbayItem,
  normalizeSearchResponse,
  TrackedUrlError,
};
