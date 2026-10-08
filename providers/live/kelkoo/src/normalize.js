'use strict';

/**
 * Normalize Kelkoo Shopping API /search/offers payload → a-search products (FR-064/065).
 * When landingPageUrl is present, stamps JWT userId tenant + KELKOO_PUBLISHER_ID
 * via buildTrackedUrl (FR-057 family).
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
 * @param {object} offer
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object}
 */
function normalizeKelkooOffer(offer, track) {
  if (!offer || typeof offer !== 'object') {
    return { id: '', title: '', source: 'kelkoo' };
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
      offer.imageUrl != null
        ? String(offer.imageUrl)
        : offer.image != null
          ? String(offer.image)
          : undefined,
    price: offer.price != null ? offer.price : undefined,
    currency: offer.currency != null ? String(offer.currency) : undefined,
    source: 'kelkoo',
  });

  assertProductSchema(product);
  return product;
}

/**
 * @param {object} body - /search/offers JSON
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track]
 * @returns {object[]}
 */
function normalizeSearchResponse(body, track) {
  const offers =
    body && Array.isArray(body.offers)
      ? body.offers.filter((o) => o && typeof o === 'object')
      : [];
  return offers.map((offer) => normalizeKelkooOffer(offer, track));
}

module.exports = {
  normalizeKelkooOffer,
  normalizeSearchResponse,
  TrackedUrlError,
};
