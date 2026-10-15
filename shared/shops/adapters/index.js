'use strict';

/**
 * FR-216 adapter registry. Prefer OAuth / app-install (FR-236+) over pasted keys.
 */

const fixture = require('./fixture');
const shopify = require('./shopify');
const wix = require('./wix');
const woocommerce = require('./woocommerce');
const magento = require('./magento');

/** @type {Record<string, object>} */
const ADAPTERS = {
  fixture,
  shopify,
  wix,
  woocommerce,
  magento,
};

/**
 * @param {string} provider
 */
function getAdapter(provider) {
  const key = String(provider || '')
    .trim()
    .toLowerCase();
  const adapter = ADAPTERS[key];
  if (!adapter) {
    const err = new Error('unknown_provider');
    err.code = 'unknown_provider';
    throw err;
  }
  return adapter;
}

function listProviders() {
  return Object.keys(ADAPTERS);
}

module.exports = { getAdapter, listProviders, ADAPTERS };