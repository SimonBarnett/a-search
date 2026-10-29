'use strict';

/**
 * FR-215 / #1220: merchant "Add shop" catalogue-provider picker.
 * Build the list from registry `merchantConnect: true` plus the locked MERCHANT
 * platform plan so new connectors are config + adapter (not hardcoded UI only).
 * OAuth / Stripe are out of scope.
 */

/** Locked MERCHANT connector ids (PrestaShop dropped; eBay/Etsy are PROVIDERs). */
const MERCHANT_PLATFORM_PLAN = Object.freeze([
  { id: 'shopify', label: 'Shopify' },
  { id: 'wix', label: 'Wix' },
  { id: 'woocommerce', label: 'WooCommerce' },
  { id: 'squarespace', label: 'Squarespace' },
  { id: 'magento', label: 'Magento / Adobe Commerce' },
  { id: 'bigcommerce', label: 'BigCommerce' },
  { id: 'ecwid', label: 'Ecwid' },
]);

const MERCHANT_PLATFORM_IDS = Object.freeze(
  MERCHANT_PLATFORM_PLAN.map((p) => p.id),
);

function _sources(registry) {
  if (!registry || typeof registry !== 'object') return [];
  if (Array.isArray(registry.sources)) return registry.sources;
  return [];
}

function _registryById(registry) {
  const map = Object.create(null);
  for (const src of _sources(registry)) {
    if (src && typeof src.id === 'string') map[src.id] = src;
  }
  return map;
}

function _envEnabled(src, env) {
  if (!src || !src.enabled || typeof src.enabled !== 'object') return false;
  if (env === 'sandbox') return src.enabled.sandbox === true;
  return src.enabled.live === true;
}

/**
 * @param {object} registry providers/registry.json
 * @param {{ env?: 'live'|'sandbox' }} [opts]
 * @returns {Array<{ id: string, label: string, class: 'merchant', connectEnabled: boolean, comingSoon: boolean, merchantConnect: boolean }>}
 */
function listMerchantConnectProviders(registry, opts) {
  const env = (opts && opts.env) || 'live';
  const byId = _registryById(registry);
  return MERCHANT_PLATFORM_PLAN.map((plan) => {
    const src = byId[plan.id];
    const flagged =
      src &&
      (src.merchantConnect === true || src.class === 'merchant');
    const connectEnabled = Boolean(
      flagged && _envEnabled(src, env) && src.merchantConnect === true,
    );
    return {
      id: plan.id,
      label: plan.label,
      class: 'merchant',
      merchantConnect: true,
      connectEnabled,
      comingSoon: !connectEnabled,
    };
  });
}

function _find(id, registry, opts) {
  const want = String(id || '')
    .trim()
    .toLowerCase();
  if (!want) return null;
  return (
    listMerchantConnectProviders(registry, opts).find((p) => p.id === want) ||
    null
  );
}

/** True when the seat may proceed to the connect step (FR-216+). */
function canAdvanceToConnect(selectedId, registry, opts) {
  const row = _find(selectedId, registry, opts);
  return Boolean(row && row.connectEnabled);
}

/** Disabled / planned platforms: interest capture, not an error. */
function needsInterestCapture(selectedId, registry, opts) {
  const row = _find(selectedId, registry, opts);
  return Boolean(row && row.comingSoon);
}

module.exports = {
  MERCHANT_PLATFORM_PLAN,
  MERCHANT_PLATFORM_IDS,
  listMerchantConnectProviders,
  canAdvanceToConnect,
  needsInterestCapture,
};
