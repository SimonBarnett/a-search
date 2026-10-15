'use strict';

/**
 * FR-216 / FR-235 prelude: in-memory Shops registry for connect orchestration.
 * Durable SQL is db/migrations/010_Shops.sql (a_search). Credentials stay in a
 * vault pointer only -- never returned to the browser.
 */

const crypto = require('node:crypto');

/**
 * @typedef {{
 *   shopId: string,
 *   merchantUserId: string,
 *   env: string,
 *   provider: string,
 *   providerShopId: string,
 *   shopDomain: string,
 *   displayName: string,
 *   scopes: string[],
 *   status: string,
 *   statusReason: string|null,
 *   credentialsSecretRef: string|null,
 *   createdAt: number,
 * }} ShopRow
 */

function createShopsRegistry() {
  /** @type {ShopRow[]} */
  const rows = [];

  return {
    /**
     * @param {{
     *   merchantUserId: string,
     *   env: string,
     *   provider: string,
     *   providerShopId: string,
     *   shopDomain: string,
     *   displayName?: string,
     *   scopes?: string[],
     *   credentialsSecretRef?: string|null,
     *   nowMs?: number,
     * }} args
     */
    insert(args) {
      const shopId = `shp_${crypto.randomBytes(8).toString('hex')}`;
      /** @type {ShopRow} */
      const row = {
        shopId,
        merchantUserId: String(args.merchantUserId),
        env: String(args.env),
        provider: String(args.provider).toLowerCase(),
        providerShopId: String(args.providerShopId),
        shopDomain: String(args.shopDomain),
        displayName: String(args.displayName || args.shopDomain),
        scopes: Array.isArray(args.scopes) ? args.scopes.map(String) : [],
        status: 'pending_payment',
        statusReason: null,
        credentialsSecretRef:
          args.credentialsSecretRef != null
            ? String(args.credentialsSecretRef)
            : null,
        createdAt: args.nowMs != null ? Number(args.nowMs) : Date.now(),
      };
      rows.push(row);
      return { ...row };
    },
    getByShopId(shopId) {
      const row = rows.find((r) => r.shopId === String(shopId));
      return row ? { ...row } : null;
    },
    getByProviderShopId(provider, providerShopId) {
      const p = String(provider).toLowerCase();
      const id = String(providerShopId);
      const row = rows.find(
        (r) => r.provider === p && r.providerShopId === id,
      );
      return row ? { ...row } : null;
    },
    /**
     * @param {string} shopId
     * @param {string} status
     * @param {string|null} [reason]
     */
    updateStatus(shopId, status, reason) {
      const row = rows.find((r) => r.shopId === String(shopId));
      if (!row) return null;
      row.status = String(status);
      row.statusReason = reason != null ? String(reason) : null;
      return { ...row };
    },
    deleteByShopId(shopId) {
      const i = rows.findIndex((r) => r.shopId === String(shopId));
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
    /**
     * Public view: never includes raw credentials.
     * @param {string} merchantUserId
     * @param {string} env
     */
    listByMerchant(merchantUserId, env) {
      return rows
        .filter(
          (r) =>
            r.merchantUserId === String(merchantUserId) &&
            r.env === String(env),
        )
        .map((r) => ({
          shopId: r.shopId,
          merchantUserId: r.merchantUserId,
          env: r.env,
          provider: r.provider,
          providerShopId: r.providerShopId,
          shopDomain: r.shopDomain,
          displayName: r.displayName,
          scopes: r.scopes.slice(),
          status: r.status,
          statusReason: r.statusReason,
          createdAt: r.createdAt,
        }));
    },
  };
}

module.exports = { createShopsRegistry };