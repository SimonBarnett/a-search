'use strict';

class ShopConflictError extends Error {
  constructor(message) {
    super(message || 'shop_already_connected');
    this.name = 'ShopConflictError';
    this.code = 'shop_already_connected';
    this.statusCode = 409;
  }
}

class ShopTransitionError extends Error {
  constructor(fromStatus, toStatus) {
    super(`illegal_transition:${fromStatus}->${toStatus}`);
    this.name = 'ShopTransitionError';
    this.code = 'illegal_transition';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
  }
}

module.exports = { ShopConflictError, ShopTransitionError };