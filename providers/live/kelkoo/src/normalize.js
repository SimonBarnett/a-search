'use strict';

/**
 * Normalize Kelkoo Shopping API offers → a-search product schema (FR-064/065).
 * Enabled via FR-167; credentials from Secrets Manager (never commit secrets).
 *
 * Field map:
 * - `offerId` → `id`
 * - `landingPageUrl` → `url` via `buildTrackedUrl` + `KELKOO_PUBLISHER_ID` when present
 * - `merchantName` → `description` (optional merchant label)
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
 * @param {object} offer - one element of response.offers
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object} product (may have empty id/title for bad rows)
 */
function normalizeKelkooOffer(offer, track) {
  if (!offer || typeof offer !== 'object') {
    const empty = normalizeProduct({ id: '', title: '', source: 'kelkoo' });
    assertProductSchema(empty);
    return empty;
  }

  const rawUrl =
    offer.landingPageUrl != null
      ? String(offer.landingPageUrl)
      : offer.url != null
        ? String(offer.url)
        : offer.clickUrl != null
          ? String(offer.clickUrl)
          : undefined;

  let url;
  if (rawUrl != null && String(rawUrl).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'kelkoo normalize requires track context { userId, envVars } for landingPageUrl',
        'tracked_url_missing_userId',
      );
    }
    url = buildTrackedUrl({
      url: String(rawUrl),
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['KELKOO_PUBLISHER_ID'],
    });
  }

  const product = normalizeProduct({
    id: offer.offerId != null ? String(offer.offerId) : '',
    title: offer.title == null ? '' : String(offer.title),
    url,
    imageUrl:
      offer.imageUrl != null && String(offer.imageUrl).trim() !== ''
        ? String(offer.imageUrl)
        : offer.image != null && String(offer.image).trim() !== ''
          ? String(offer.image)
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
 * Missing/partial offers (no offerId+title) are skipped (no throw). Empty → [].
 *
 * @param {object} shoppingBody
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(shoppingBody, track) {
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
    out.push(normalizeKelkooOffer(offer, track));
  }
  return out;
}

module.exports = {
  normalizeKelkooOffer,
  normalizeSearchResponse,
  TrackedUrlError,
};
