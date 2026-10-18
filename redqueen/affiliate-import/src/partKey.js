'use strict';

/**
 * FR #4001: stable affiliate part key (provider, affiliateid, partid).
 * Maps onto maintainer Parts as Source / FeedKey / MerchantProductId.
 */

/**
 * @param {{ provider?: unknown, affiliateid?: unknown, affiliateId?: unknown, partid?: unknown, partId?: unknown }} p
 * @returns {{ provider: string, affiliateid: string, partid: string }}
 */
function normalizePartKey(p) {
  const provider = String(p.provider || '')
    .trim()
    .toLowerCase();
  const affiliateid = String(p.affiliateid || p.affiliateId || '').trim();
  const partid = String(p.partid || p.partId || '').trim();
  if (!provider || !affiliateid || !partid) {
    const err = new Error('invalid_part_key');
    err.code = 'invalid_part_key';
    throw err;
  }
  return { provider, affiliateid, partid };
}

/**
 * @param {{ provider: string, affiliateid: string, partid: string }} key
 * @returns {string}
 */
function partKeyString(key) {
  const k = normalizePartKey(key);
  return `${k.provider}\0${k.affiliateid}\0${k.partid}`;
}

/**
 * Map FR key onto Parts table columns (Env always live for affiliate import).
 * @param {{ provider: string, affiliateid: string, partid: string }} key
 */
function toPartsRowIdentity(key) {
  const k = normalizePartKey(key);
  return {
    Source: k.provider,
    FeedKey: k.affiliateid,
    MerchantProductId: k.partid,
    Env: 'live',
  };
}

/**
 * Does a live.json candidate refer to this part key?
 * Accepts provider/source + affiliateId/feedKey + partId/merchantProductId/id.
 * @param {object} entry
 * @param {{ provider: string, affiliateid: string, partid: string }} key
 */
function liveEntryMatchesPart(entry, key) {
  if (!entry || typeof entry !== 'object') return false;
  const k = normalizePartKey(key);
  const provider = String(entry.provider || entry.source || '')
    .trim()
    .toLowerCase();
  const affiliateid = String(
    entry.affiliateid || entry.affiliateId || entry.feedKey || entry.FeedKey || '',
  ).trim();
  const partid = String(
    entry.partid ||
      entry.partId ||
      entry.merchantProductId ||
      entry.MerchantProductId ||
      entry.id ||
      '',
  ).trim();
  return (
    provider === k.provider &&
    affiliateid === k.affiliateid &&
    partid === k.partid
  );
}

module.exports = {
  normalizePartKey,
  partKeyString,
  toPartsRowIdentity,
  liveEntryMatchesPart,
};
