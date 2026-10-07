'use strict';

/**
 * Normalize eBay Browse API itemSummary → a-search product.
 * @param {object} item
 * @returns {object}
 */
function normalizeEbayItem(item) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'ebay' };
  }
  const priceObj = item.price && typeof item.price === 'object' ? item.price : null;
  const imageUrl =
    item.image && item.image.imageUrl != null
      ? String(item.image.imageUrl)
      : undefined;

  return {
    id: item.itemId != null ? String(item.itemId) : '',
    title: item.title == null ? '' : String(item.title),
    url: item.itemWebUrl == null ? undefined : String(item.itemWebUrl),
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
 * @returns {object[]}
 */
function normalizeSearchResponse(browseBody) {
  const items =
    browseBody && Array.isArray(browseBody.itemSummaries)
      ? browseBody.itemSummaries
      : [];
  return items.map(normalizeEbayItem);
}

module.exports = { normalizeEbayItem, normalizeSearchResponse };
