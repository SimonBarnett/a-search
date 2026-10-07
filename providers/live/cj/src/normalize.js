'use strict';

/**
 * Normalize a CJ GraphQL product node → a-search product.
 * @param {object} item
 * @returns {object}
 */
function normalizeCjItem(item) {
  if (!item || typeof item !== 'object') {
    return { id: '', title: '', source: 'cj' };
  }
  const priceObj =
    item.price && typeof item.price === 'object' ? item.price : null;
  const link =
    item.linkCode && item.linkCode.clickUrl != null
      ? String(item.linkCode.clickUrl)
      : item.link != null
        ? String(item.link)
        : item.url != null
          ? String(item.url)
          : undefined;

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
    url: link,
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
 * @returns {object[]}
 */
function normalizeSearchResponse(gqlBody) {
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
  return list.map(normalizeCjItem);
}

module.exports = { normalizeCjItem, normalizeSearchResponse };
