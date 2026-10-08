'use strict';

const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');

/**
 * Normalize a CJ GraphQL product node → a-search product.
 * When clickUrl/link/url is present, stamps JWT userId tenant + CJ_WEBSITE_ID
 * via buildTrackedUrl (FR-057g).
 *
 * @param {object} item
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeCjItem(item, track) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'cj' };
  }
  const priceObj =
    item.price && typeof item.price === 'object' ? item.price : null;
  const rawUrl =
    item.linkCode && item.linkCode.clickUrl != null
      ? String(item.linkCode.clickUrl)
      : item.link != null
        ? String(item.link)
        : item.url != null
          ? String(item.url)
          : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'cj normalize requires track context { userId, envVars } for clickUrl',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['CJ_WEBSITE_ID'],
    });
  }

  return {
    id:
      item.id != null
        ? String(item.id)
        : item.adId != null
          ? String(item.adId)
          : '',
    title:
      item.title != null
        ? String(item.title)
        : item.name != null
          ? String(item.name)
          : '',
    url,
    imageUrl:
      item.imageLink != null
        ? String(item.imageLink)
        : item.imageUrl != null
          ? String(item.imageUrl)
          : undefined,
    price:
      priceObj && priceObj.amount != null
        ? Number(priceObj.amount)
        : item.price != null && typeof item.price !== 'object'
          ? Number(item.price)
          : undefined,
    currency:
      priceObj && priceObj.currency != null
        ? String(priceObj.currency)
        : undefined,
    source: 'cj',
  };
}

/**
 * @param {object} gqlBody - GraphQL JSON response
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(gqlBody, track) {
  const list =
    gqlBody &&
    gqlBody.data &&
    gqlBody.data.products &&
    Array.isArray(gqlBody.data.products.resultList)
      ? gqlBody.data.products.resultList
      : gqlBody &&
          gqlBody.data &&
          Array.isArray(gqlBody.data.shoppingProducts)
        ? gqlBody.data.shoppingProducts
        : [];
  return list.map((item) => normalizeCjItem(item, track));
}

module.exports = {
  normalizeCjItem,
  normalizeSearchResponse,
  TrackedUrlError,
};
