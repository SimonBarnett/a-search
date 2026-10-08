'use strict';

const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');

/**
 * Normalize a Rakuten Product Search item object → a-search product.
 * When linkurl/url is present, stamps JWT userId tenant + RAKUTEN_SITE_ID
 * via buildTrackedUrl (FR-057f).
 *
 * @param {object} item
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeRakutenItem(item, track) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'rakuten' };
  }
  const id =
    item.productid != null
      ? String(item.productid)
      : item.sku != null
        ? String(item.sku)
        : item.mid != null
          ? String(item.mid)
          : '';
  const title =
    item.productname != null
      ? String(item.productname)
      : item.name != null
        ? String(item.name)
        : '';
  const priceRaw =
    item.price != null
      ? item.price
      : item.saleprice != null
        ? item.saleprice
        : undefined;
  const price =
    priceRaw != null && String(priceRaw).trim() !== ''
      ? Number(priceRaw)
      : undefined;

  const rawUrl =
    item.linkurl != null
      ? String(item.linkurl)
      : item.url != null
        ? String(item.url)
        : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'rakuten normalize requires track context { userId, envVars } for linkurl',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['RAKUTEN_SITE_ID'],
    });
  }

  return {
    id,
    title,
    url,
    imageUrl:
      item.imageurl != null
        ? String(item.imageurl)
        : item.image != null
          ? String(item.image)
          : undefined,
    price: Number.isFinite(price) ? price : undefined,
    currency:
      item.currency != null && String(item.currency).trim()
        ? String(item.currency).trim()
        : undefined,
    source: 'rakuten',
  };
}

/**
 * @param {object[]} items
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchItems(items, track) {
  return (Array.isArray(items) ? items : []).map((item) =>
    normalizeRakutenItem(item, track),
  );
}

module.exports = {
  normalizeRakutenItem,
  normalizeSearchItems,
  TrackedUrlError,
};
