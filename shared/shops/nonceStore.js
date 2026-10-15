'use strict';

/**
 * FR-216: connect state nonce (10 min TTL), bound to merchantUserId + env.
 * In-memory default for tests; swap for durable store in deploy.
 */

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/**
 * @param {{ ttlMs?: number }} [opts]
 */
function createNonceStore(opts = {}) {
  const ttlMs = opts.ttlMs != null ? Number(opts.ttlMs) : DEFAULT_TTL_MS;
  /** @type {Map<string, { merchantUserId: string, env: string, provider: string, shopDomain?: string, createdAt: number }>} */
  const map = new Map();

  return {
    ttlMs,
    /**
     * @param {{ merchantUserId: string, env: string, provider: string, shopDomain?: string, nowMs?: number }} args
     */
    create(args) {
      const state = crypto.randomBytes(24).toString('hex');
      map.set(state, {
        merchantUserId: String(args.merchantUserId),
        env: String(args.env),
        provider: String(args.provider).toLowerCase(),
        shopDomain: args.shopDomain ? String(args.shopDomain) : undefined,
        createdAt: args.nowMs != null ? Number(args.nowMs) : Date.now(),
      });
      return state;
    },
    /**
     * Consume once. Throws invalid_state / nonce_expired / provider_mismatch.
     * @param {{ state: string, provider: string, nowMs?: number }} args
     */
    consume(args) {
      const state = String(args.state || '');
      const row = map.get(state);
      if (!row) {
        const err = new Error('invalid_state');
        err.code = 'invalid_state';
        throw err;
      }
      map.delete(state);
      const now = args.nowMs != null ? Number(args.nowMs) : Date.now();
      if (now - row.createdAt > ttlMs) {
        const err = new Error('nonce_expired');
        err.code = 'nonce_expired';
        throw err;
      }
      const provider = String(args.provider || '').toLowerCase();
      if (provider && provider !== row.provider) {
        const err = new Error('provider_mismatch');
        err.code = 'provider_mismatch';
        throw err;
      }
      return row;
    },
  };
}

module.exports = { createNonceStore, DEFAULT_TTL_MS };
