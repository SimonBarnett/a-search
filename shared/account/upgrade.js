'use strict';

/**
 * #1344 / #1345 prelude: POST /account/upgrade -> Stripe Checkout URL (stubbable).
 */

/**
 * @param {{
 *   host: string,
 *   userId: string,
 *   customerNumber?: string,
 *   checkoutUrlFor?: (args: object) => string,
 * }} args
 */
function startUpgradeCheckout(args) {
  const host = String((args && args.host) || '').trim();
  if (!host) {
    const err = new Error('host_required');
    err.code = 'host_required';
    throw err;
  }
  const userId = String((args && args.userId) || '')
    .trim()
    .toUpperCase();
  if (!userId) {
    const err = new Error('user_required');
    err.code = 'user_required';
    throw err;
  }
  const customerNumber = String(
    (args && args.customerNumber) || userId,
  ).trim();
  if (typeof args.checkoutUrlFor === 'function') {
    return {
      ok: true,
      url: args.checkoutUrlFor({ host, userId, customerNumber }),
      customerNumber,
    };
  }
  // Deterministic stub URL for pins (no live Stripe).
  const url =
    'https://checkout.stripe.com/c/pay/stub_upgrade' +
    '?client_reference_id=' +
    encodeURIComponent(customerNumber) +
    '&host=' +
    encodeURIComponent(host);
  return { ok: true, url, customerNumber };
}

/** @returns {{ isUpgraded: (host: string) => boolean, setUpgraded: (host: string, v: boolean) => void }} */
function createUpgradeCache() {
  /** @type {Set<string>} */
  const upgraded = new Set();
  return {
    isUpgraded(host) {
      return upgraded.has(String(host || '').toLowerCase());
    },
    setUpgraded(host, v) {
      const key = String(host || '').toLowerCase();
      if (v) upgraded.add(key);
      else upgraded.delete(key);
    },
  };
}

module.exports = {
  startUpgradeCheckout,
  createUpgradeCache,
};
