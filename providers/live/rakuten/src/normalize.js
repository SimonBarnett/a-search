'use strict';

/**
 * Normalize a Rakuten Product Search item object → a-search product.
 * @param {object} item
 * @returns {object}
 */
function normalizeRakutenItem(item) {
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

  return {
    id,
    title,
    url:
      item.linkurl != null
        ? String(item.linkurl)
        : item.url != null
          ? String(item.url)
          : undefined,
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
 * @returns {object[]}
 */
function normalizeSearchItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeRakutenItem);
}

module.exports = { normalizeRakutenItem, normalizeSearchItems };
