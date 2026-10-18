'use strict';

/**
 * #1345: Stripe widget_upgrade -> Customers upgrade cache + tier_changed enqueue.
 * merchant_shop events must never touch upgradeStatus (FR-239).
 */

const {
  getCustomerByNumber,
  updateCustomer,
  listActiveWidgets,
} = require('../components/customers');

/**
 * Stripe subscription.status -> Customers.upgradeStatus.
 * active|trialing => active; past_due|canceled|unpaid|incomplete => lapsed.
 * @param {string} stripeStatus
 * @returns {'active'|'lapsed'|'none'}
 */
function mapStripeSubscriptionToUpgradeStatus(stripeStatus) {
  const s = String(stripeStatus || '')
    .trim()
    .toLowerCase();
  if (s === 'active' || s === 'trialing') return 'active';
  if (
    s === 'past_due' ||
    s === 'canceled' ||
    s === 'unpaid' ||
    s === 'incomplete' ||
    s === 'incomplete_expired'
  ) {
    return 'lapsed';
  }
  return 'none';
}

/**
 * @param {object} stripeObject subscription-like
 * @returns {boolean}
 */
function isWidgetUpgradeProduct(stripeObject) {
  const meta =
    (stripeObject && stripeObject.metadata) ||
    (stripeObject &&
      stripeObject.items &&
      stripeObject.items.data &&
      stripeObject.items.data[0] &&
      stripeObject.items.data[0].price &&
      stripeObject.items.data[0].price.metadata) ||
    {};
  return String(meta.aSearchProduct || '').trim() === 'widget_upgrade';
}

/**
 * Apply a Stripe subscription event for widget_upgrade only.
 * @param {{
 *   store: object,
 *   stripeObject: object,
 *   at?: string,
 *   enqueueTierChanged?: (msg: object) => void,
 * }} args
 * @returns {{
 *   ok: boolean,
 *   skipped?: string,
 *   upgradeStatus?: string,
 *   customerNumber?: string,
 *   tierChangedCount?: number,
 * }}
 */
function applyWidgetUpgradeStripeEvent(args) {
  const store = args && args.store;
  const obj = args && args.stripeObject;
  if (!store || !obj) {
    const err = new Error('store_and_stripeObject_required');
    err.code = 'bad_args';
    throw err;
  }
  if (!isWidgetUpgradeProduct(obj)) {
    return { ok: true, skipped: 'not_widget_upgrade' };
  }
  const customerNumber = String(
    (obj.metadata && obj.metadata.customerNumber) || '',
  ).trim();
  if (!customerNumber) {
    const err = new Error('customerNumber_required');
    err.code = 'customerNumber_required';
    throw err;
  }
  const cust = getCustomerByNumber(store, customerNumber);
  if (!cust) {
    const err = new Error('customer_not_found');
    err.code = 'customer_not_found';
    throw err;
  }
  const upgradeStatus = mapStripeSubscriptionToUpgradeStatus(obj.status);
  const at = args.at || new Date().toISOString();
  updateCustomer(store, cust.host, {
    upgradeStatus,
    upgradeSubscriptionId: obj.id != null ? String(obj.id) : null,
    upgradeCheckedAt: at,
  });
  const widgets = listActiveWidgets(store, customerNumber);
  const enqueue =
    typeof args.enqueueTierChanged === 'function'
      ? args.enqueueTierChanged
      : null;
  let tierChangedCount = 0;
  if (enqueue) {
    for (const w of widgets) {
      enqueue({
        eventType: 'tier_changed',
        customerNumber,
        widgetGuid: w.widgetGuid,
        host: cust.host,
        at,
      });
      tierChangedCount += 1;
    }
  }
  return {
    ok: true,
    upgradeStatus,
    customerNumber,
    tierChangedCount,
  };
}

/**
 * Dispatcher helper: upgraded flag from Customers.upgradeStatus.
 * @param {string|null|undefined} upgradeStatus
 * @returns {boolean}
 */
function isUpgradedStatus(upgradeStatus) {
  const s = String(upgradeStatus || '')
    .trim()
    .toLowerCase();
  return s === 'active';
}

module.exports = {
  mapStripeSubscriptionToUpgradeStatus,
  isWidgetUpgradeProduct,
  applyWidgetUpgradeStripeEvent,
  isUpgradedStatus,
};
