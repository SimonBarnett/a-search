'use strict';

/**
 * FR-248: per-source outbound link param slots.
 * class: affiliate | merchant | provider
 */

/** @typedef {'affiliate'|'merchant'|'provider'} SourceClass */

/**
 * @type {Record<string, {
 *   class: SourceClass,
 *   affiliateEnv?: string|string[],
 *   affiliateParam?: string,
 *   tenantParam?: string|null,
 *   partnerParam?: string|null,
 *   clickIdParam?: string|null,
 *   extraAccountParams?: Record<string, string>,
 *   notes?: string,
 * }>}
 */
const NETWORK_PARAMS = Object.freeze({
  // --- affiliates (kind: local, commission) ---
  awin: {
    class: 'affiliate',
    affiliateEnv: 'AWIN_PUBLISHER_ID',
    affiliateParam: 'awinaffid',
    tenantParam: 'clickref',
    partnerParam: 'clickref2',
    clickIdParam: 'clickref3',
    extraAccountParams: { AWIN_ADVERTISER_ID: 'awinmid' },
  },
  impact: {
    class: 'affiliate',
    // Affiliate ids live in path /c/{mpId}/{adId}/{campaignId}; subId1 is tenant.
    affiliateEnv: ['IMPACT_MEDIA_PARTNER_ID', 'IMPACT_CAMPAIGN_ID'],
    tenantParam: 'subId1',
    partnerParam: 'subId2',
    clickIdParam: 'subId3',
    notes: 'campaign belongs in path, not subId1',
  },
  partnerize: {
    class: 'affiliate',
    affiliateEnv: 'PARTNERIZE_PUBLISHER_ID',
    affiliateParam: 'camref',
    tenantParam: 'pubref',
    partnerParam: null,
    clickIdParam: null,
  },
  webgains: {
    class: 'affiliate',
    affiliateEnv: 'WEBGAINS_CAMPAIGN_ID',
    affiliateParam: 'wgcampaignid',
    tenantParam: 'clickref',
    partnerParam: null,
    clickIdParam: null,
  },
  tradedoubler: {
    class: 'affiliate',
    affiliateEnv: 'TRADEDOUBLER_AFFILIATE_ID',
    affiliateParam: 'a',
    tenantParam: 'epi',
    partnerParam: null,
    clickIdParam: 'epi2',
    extraAccountParams: { TRADEDOUBLER_PROGRAMME_ID: 'p' },
  },
  admitad: {
    class: 'affiliate',
    affiliateEnv: 'ADMITAD_WEBSITE_ID',
    affiliateParam: 'admitad_uid',
    tenantParam: 'subid',
    partnerParam: 'subid1',
    clickIdParam: 'subid4',
    notes: 'do not use subid3 (promo-code override)',
  },
  flexoffers: {
    class: 'affiliate',
    affiliateEnv: 'FLEXOFFERS_AFFILIATE_ID',
    affiliateParam: 'foid',
    tenantParam: 'fobs',
    partnerParam: null,
    clickIdParam: null,
  },
  avantlink: {
    class: 'affiliate',
    affiliateEnv: 'AVANTLINK_AFFILIATE_ID',
    affiliateParam: 'pw',
    tenantParam: 'ctc',
    partnerParam: null,
    clickIdParam: null,
    extraAccountParams: { AVANTLINK_MERCHANT_ID: 'mi' },
  },

  // --- providers (kind: live) ---
  amazon: {
    class: 'provider',
    affiliateEnv: 'AMAZON_PARTNER_TAG',
    affiliateParam: 'tag',
    tenantParam: null, // tenant folded into tag for upgraded clubs
    partnerParam: null,
    clickIdParam: null,
  },
  ebay: {
    class: 'provider',
    affiliateEnv: 'EBAY_CAMPAIGN_ID',
    affiliateParam: 'campid',
    tenantParam: 'customid',
    partnerParam: null,
    clickIdParam: null,
    notes: 'also mkcid=1 mkrid toolid=10001 mkevt=1',
  },
  etsy: {
    class: 'provider',
    affiliateEnv: 'ETSY_TRACKING_ID',
    affiliateParam: 'id',
    tenantParam: 'u1',
    partnerParam: null,
    clickIdParam: null,
    extraAccountParams: { ETSY_RAKUTEN_MID: 'mid' },
  },
  rakuten: {
    class: 'provider',
    // Publisher id -> query `id` (bugfix: was mid). Advertiser mid separate.
    affiliateEnv: 'RAKUTEN_SITE_ID',
    affiliateParam: 'id',
    tenantParam: 'u1',
    partnerParam: null,
    clickIdParam: null,
    extraAccountParams: { RAKUTEN_MID: 'mid' },
  },
  cj: {
    class: 'provider',
    // PID is path segment /click-{PID}-{AID}; sid is tenant (bugfix).
    affiliateEnv: 'CJ_WEBSITE_ID',
    affiliateParam: null,
    tenantParam: 'sid',
    partnerParam: null,
    clickIdParam: null,
  },
  skimlinks: {
    class: 'provider',
    affiliateEnv: 'SKIMLINKS_PUBLISHER_ID',
    affiliateParam: 'id',
    tenantParam: 'xcust',
    partnerParam: null,
    clickIdParam: null,
  },
  kelkoo: {
    class: 'provider',
    affiliateEnv: 'KELKOO_PUBLISHER_ID',
    affiliateParam: 'publisher',
    tenantParam: 'custom1',
    partnerParam: null,
    clickIdParam: null,
    notes: 'verify custom1 during enable',
  },
  aliexpress: {
    class: 'provider',
    affiliateEnv: 'ALIEXPRESS_TRACKING_ID',
    affiliateParam: 'tracking_id',
    tenantParam: 'aff_sub',
    partnerParam: null,
    clickIdParam: null,
    notes: 'verify aff_sub during enable',
  },
  bol: {
    class: 'provider',
    affiliateEnv: 'BOL_TRACKING_ID',
    affiliateParam: 'id',
    tenantParam: 'subId',
    partnerParam: null,
    clickIdParam: null,
    notes: 'verify subId during enable',
  },

  // --- merchants (subscription; no affiliate stamp) ---
  shopify: { class: 'merchant' },
  wix: { class: 'merchant' },
  woocommerce: { class: 'merchant' },
  squarespace: { class: 'merchant' },
  magento: { class: 'merchant' },
  bigcommerce: { class: 'merchant' },
  ecwid: { class: 'merchant' },
  prestashop: { class: 'merchant' },
});

/**
 * Corrected env-key → affiliate query param map (FR-248 bug fixes).
 * IMPACT campaign is NOT mapped to subId1; CJ website id is NOT sid;
 * RAKUTEN_SITE_ID is publisher `id` not advertiser `mid`.
 */
const DEFAULT_ACCOUNT_QUERY_MAP = Object.freeze({
  AMAZON_PARTNER_TAG: 'tag',
  AWIN_PUBLISHER_ID: 'awinaffid',
  AWIN_ADVERTISER_ID: 'awinmid',
  EBAY_CAMPAIGN_ID: 'campid',
  RAKUTEN_SITE_ID: 'id',
  RAKUTEN_MID: 'mid',
  SKIMLINKS_SITE_ID: 'id',
  KELKOO_PUBLISHER_ID: 'publisher',
  FLEXOFFERS_AFFILIATE_ID: 'foid',
  AVANTLINK_AFFILIATE_ID: 'pw',
  TRADEDOUBLER_AFFILIATE_ID: 'a',
  WEBGAINS_CAMPAIGN_ID: 'wgcampaignid',
  PARTNERIZE_CAMREF: 'camref',
  // CJ_WEBSITE_ID intentionally absent (path PID, not query)
  // IMPACT_CAMPAIGN_ID intentionally absent (path segment, not subId1)
});

/**
 * @param {string} source
 */
function getNetworkParams(source) {
  const key = String(source || '')
    .trim()
    .toLowerCase();
  return NETWORK_PARAMS[key] || null;
}

/**
 * @param {string} source
 * @returns {SourceClass|null}
 */
function getSourceClass(source) {
  const n = getNetworkParams(source);
  return n ? n.class : null;
}

module.exports = {
  NETWORK_PARAMS,
  DEFAULT_ACCOUNT_QUERY_MAP,
  getNetworkParams,
  getSourceClass,
};
