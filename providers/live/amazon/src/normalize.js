'use strict';

/**
 * Normalize Amazon PA-API SearchItems item → a-search product.
 * @param {object} item
 * @returns {object}
 */
function normalizeAmazonItem(item) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'amazon' };
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

  return {
    id: item.ASIN != null ? String(item.ASIN) : '',
    title: title == null ? '' : String(title),
    url: item.DetailPageURL == null ? undefined : String(item.DetailPageURL),
    imageUrl: imageUrl == null ? undefined : String(imageUrl),
    price:
      priceObj && priceObj.Amount != null ? Number(priceObj.Amount) : undefined,
    currency:
      priceObj && priceObj.Currency != null
        ? String(priceObj.Currency)
        : undefined,
    source: 'amazon',
  };
}

/**
 * @param {object} paapiBody - SearchItems response JSON
 * @returns {object[]}
 */
function normalizeSearchResponse(paapiBody) {
  const items =
    paapiBody &&
    paapiBody.SearchResult &&
    Array.isArray(paapiBody.SearchResult.Items)
      ? paapiBody.SearchResult.Items
      : [];
  return items.map(normalizeAmazonItem);
}

module.exports = { normalizeAmazonItem, normalizeSearchResponse };
