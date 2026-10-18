'use strict';

/**
 * FR-235: Shop status machine. Only listed transitions are legal.
 */

const { ShopTransitionError } = require('./errors');

/** @type {Record<string, string[]>} */
const ALLOWED_TRANSITIONS = Object.freeze({
  pending_payment: ['live', 'suspended', 'cancelled'],
  live: ['suspended', 'cancelled'],
  suspended: ['live', 'cancelled'],
  cancelled: [],
});

function assertAllowed(fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new ShopTransitionError(fromStatus, toStatus);
  }
}

/**
 * @param {{ transition: Function }} shops
 * @param {string} shopId
 * @param {string} toStatus
 * @param {object} [opts]
 */
function transitionShop(shops, shopId, toStatus, opts) {
  return shops.transition(shopId, toStatus, opts || {});
}

module.exports = {
  ALLOWED_TRANSITIONS,
  transitionShop,
  assertAllowed,
  ShopTransitionError,
};