'use strict';

/**
 * Normalize Kelkoo Shopping API offers → a-search product schema (FR-064).
 * Stay-dark: do not enable registry. Worker wiring is out of scope.
 *
 * Field map (non-obvious):
 * - `offerId` → `id`
 * - `landingPageUrl` → `url` (publisher landing from Shopping API JWT session;
 *   no separate campaign-tag rewrite in this FR)
 * - `merchantName` → `description` (merchant label; optional)
 */

const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');

/**
 * @param {object} offer - one element of response.offers
 * @returns {object} product (may have empty id/title for bad rows)
 */
function normalizeKelkooOffer(offer) {
  if (!offer || typeof offer !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'kelkoo' });
    assertProductSchema(empty);
    return empty;
  }

  const product = normalizeProduct({
    id: offer.offerId != null ? String(offer.offerId) : '',
    title: offer.title == null ? '' : String(offer.title),
    url:
      offer.landingPageUrl != null && String(offer.landingPageUrl).trim() !== ''
        ? String(offer.landingPageUrl)
        : undefined,
    imageUrl:
      offer.imageUrl != null && String(offer.imageUrl).trim() !== ''
        ? String(offer.imageUrl)
        : undefined,
    price: offer.price != null ? Number(offer.price) : undefined,
    currency:
      offer.currency != null && String(offer.currency).trim() !== ''
        ? String(offer.currency)
        : undefined,
    description:
      offer.merchantName != null && String(offer.merchantName).trim() !== ''
        ? String(offer.merchantName)
        : undefined,
    source: 'kelkoo',
  });
  assertProductSchema(product);
  return product;
}

/**
 * Map a Kelkoo /search/offers JSON body to products.
 * Missing/partial offers are skipped (no throw). Empty body → [].
 *
 * @param {object} shoppingBody
 * @returns {object[]}
 */
function normalizeSearchResponse(shoppingBody) {
  const offers =
    shoppingBody && Array.isArray(shoppingBody.offers)
      ? shoppingBody.offers
      : [];
  const out = [];
  for (const offer of offers) {
    if (!offer || typeof offer !== 'object') continue;
    const id = offer.offerId != null ? String(offer.offerId).trim() : '';
    const title = offer.title != null ? String(offer.title).trim() : '';
    if (!id || !title) continue;
    out.push(normalizeKelkooOffer(offer));
  }
  return out;
}

module.exports = {
  normalizeKelkooOffer,
  normalizeSearchResponse,
};
