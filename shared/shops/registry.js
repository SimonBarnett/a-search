'use strict';

/**
 * FR-235: Merchant Shops registry (many shops per merchant) + status log.
 * Unique (env, provider, providerShopId). Credentials = vault pointer only.
 */

const crypto = require('node:crypto');
const { assertAllowed } = require('./status');
const { ShopConflictError, ShopTransitionError } = require('./errors');

/** Production merchant connectors (Simon 14:35; no prestashop). */
const MERCHANT_SHOP_PROVIDERS = Object.freeze([
  'shopify',
  'wix',
  'woocommerce',
  'squarespace',
  'magento',
  'bigcommerce',
  'ecwid',
]);

/** Test-only FR-216 fixture adapter id. */
const TEST_SHOP_PROVIDERS = Object.freeze(['fixture']);

function newShopId() {
  return `shp_${crypto.randomBytes(10).toString('hex')}`;
}

function assertProvider(provider) {
  const p = String(provider || '')
    .trim()
    .toLowerCase();
  if (
    !MERCHANT_SHOP_PROVIDERS.includes(p) &&
    !TEST_SHOP_PROVIDERS.includes(p)
  ) {
    const err = new Error('unsupported_shop_provider');
    err.code = 'unsupported_shop_provider';
    throw err;
  }
  return p;
}

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
 *   suspendReason: string|null,
 *   statusReason: string|null,
 *   credentialsSecretRef: string|null,
 *   stripeSubscriptionId: string|null,
 *   subscriptionStatus: string|null,
 *   lastSyncResult: string|null,
 *   liveAt: string|null,
 *   statusChangedAt: string|null,
 *   nextSyncAt: string|null,
 *   lastSyncAt: string|null,
 *   partsCount: number,
 *   createdAt: number,
 * }} ShopRow
 */

/**
 * @typedef {{
 *   shopId: string,
 *   fromStatus: string,
 *   toStatus: string,
 *   reason: string|null,
 *   at: string,
 * }} StatusLogRow
 */

function createShopsRegistry() {
  /** @type {ShopRow[]} */
  const rows = [];
  /** @type {StatusLogRow[]} */
  const logs = [];

  function findByProviderShop(env, provider, providerShopId) {
    return rows.find(
      (r) =>
        r.env === String(env) &&
        r.provider === String(provider).toLowerCase() &&
        r.providerShopId === String(providerShopId),
    );
  }

  function get(shopId) {
    const row = rows.find((r) => r.shopId === String(shopId));
    return row ? { ...row, scopes: row.scopes.slice() } : null;
  }

  /**
   * Insert or refresh credentials for the same merchant; 409 if another owns it.
   */
  function upsertConnect(args) {
    const provider = assertProvider(args.provider);
    const env = String(args.env);
    const providerShopId = String(args.providerShopId);
    const merchantUserId = String(args.merchantUserId);
    const existing = findByProviderShop(env, provider, providerShopId);
    if (existing) {
      if (existing.merchantUserId !== merchantUserId) {
        throw new ShopConflictError();
      }
      existing.shopDomain = String(args.shopDomain || existing.shopDomain);
      if (args.displayName != null) {
        existing.displayName = String(args.displayName);
      }
      if (Array.isArray(args.scopes)) {
        existing.scopes = args.scopes.map(String);
      }
      if (args.credentialsSecretRef !== undefined) {
        existing.credentialsSecretRef =
          args.credentialsSecretRef == null
            ? null
            : String(args.credentialsSecretRef);
      }
      existing.statusChangedAt = new Date(
        args.nowMs != null ? Number(args.nowMs) : Date.now(),
      ).toISOString();
      return get(existing.shopId);
    }

    const nowMs = args.nowMs != null ? Number(args.nowMs) : Date.now();
    const at = new Date(nowMs).toISOString();
    /** @type {ShopRow} */
    const row = {
      shopId: newShopId(),
      merchantUserId,
      env,
      provider,
      providerShopId,
      shopDomain: String(args.shopDomain),
      displayName: String(args.displayName || args.shopDomain),
      scopes: Array.isArray(args.scopes) ? args.scopes.map(String) : [],
      status: 'pending_payment',
      suspendReason: null,
      statusReason: null,
      credentialsSecretRef:
        args.credentialsSecretRef != null
          ? String(args.credentialsSecretRef)
          : null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
      lastSyncResult: null,
      liveAt: null,
      statusChangedAt: at,
      nextSyncAt: null,
      lastSyncAt: null,
      partsCount: 0,
      createdAt: nowMs,
    };
    rows.push(row);
    return get(row.shopId);
  }

  /** FR-216 compat alias */
  function insert(args) {
    return upsertConnect(args);
  }

  function setCredentialRef(shopId, ref) {
    const row = rows.find((r) => r.shopId === String(shopId));
    if (!row) {
      const err = new Error('shop_not_found');
      err.code = 'shop_not_found';
      throw err;
    }
    row.credentialsSecretRef = ref == null ? null : String(ref);
    return get(shopId);
  }

  function transition(shopId, toStatus, opts) {
    const row = rows.find((r) => r.shopId === String(shopId));
    if (!row) {
      const err = new Error('shop_not_found');
      err.code = 'shop_not_found';
      throw err;
    }
    const to = String(toStatus);
    assertAllowed(row.status, to);
    const from = row.status;
    const at =
      (opts && opts.at) ||
      new Date(opts && opts.nowMs != null ? Number(opts.nowMs) : Date.now()).toISOString();
    row.status = to;
    row.statusChangedAt = at;
    if (opts && opts.reason !== undefined) {
      const reason = opts.reason == null ? null : String(opts.reason);
      row.suspendReason = reason;
      row.statusReason = reason;
    }
    if (to === 'live' && !row.liveAt) {
      row.liveAt = at;
    }
    if (to === 'cancelled' && row.suspendReason == null) {
      row.suspendReason = (opts && opts.reason) || 'admin';
      row.statusReason = row.suspendReason;
    }
    logs.push({
      shopId: row.shopId,
      fromStatus: from,
      toStatus: to,
      reason: row.suspendReason,
      at,
    });
    return get(shopId);
  }

  /** FR-236 compat aliases */
  function getByShopId(shopId) {
    return get(shopId);
  }

  function getByProviderShopId(provider, providerShopId) {
    const p = String(provider).toLowerCase();
    const id = String(providerShopId);
    const row = rows.find((r) => r.provider === p && r.providerShopId === id);
    return row ? { ...row, scopes: row.scopes.slice() } : null;
  }

  function updateStatus(shopId, status, reason) {
    return transition(shopId, status, { reason });
  }

  function deleteByShopId(shopId) {
    const i = rows.findIndex((r) => r.shopId === String(shopId));
    if (i < 0) return false;
    rows.splice(i, 1);
    return true;
  }

  function statusLog(shopId) {
    return logs.filter((l) => l.shopId === String(shopId)).map((l) => ({ ...l }));
  }

  function listByMerchant(merchantUserId, env) {
    return listPublic(merchantUserId, env).map((r) => ({
      shopId: r.shopId,
      merchantUserId: String(merchantUserId),
      env: String(env),
      provider: r.provider,
      providerShopId: rows.find((x) => x.shopId === r.shopId).providerShopId,
      shopDomain: r.shopDomain,
      displayName: r.displayName,
      scopes: (rows.find((x) => x.shopId === r.shopId).scopes || []).slice(),
      status: r.status,
      createdAt: rows.find((x) => x.shopId === r.shopId).createdAt,
    }));
  }

  /** Public API shape for GET /merchant/shops — no credential refs */
  function listPublic(merchantUserId, env) {
    return rows
      .filter(
        (r) =>
          r.merchantUserId === String(merchantUserId) &&
          r.env === String(env),
      )
      .map((r) => ({
        shopId: r.shopId,
        provider: r.provider,
        shopDomain: r.shopDomain,
        displayName: r.displayName,
        status: r.status,
        suspendReason: r.suspendReason,
        liveAt: r.liveAt,
        nextSyncAt: r.nextSyncAt,
        lastSyncAt: r.lastSyncAt,
        partsCount: r.partsCount,
      }));
  }


  function setSubscriptionStatus(shopId, status, opts) {
    const row = rows.find((r) => r.shopId === String(shopId));
    if (!row) {
      const err = new Error('shop_not_found');
      err.code = 'shop_not_found';
      throw err;
    }
    row.subscriptionStatus = status == null ? null : String(status);
    if (opts && opts.stripeSubscriptionId !== undefined) {
      row.stripeSubscriptionId =
        opts.stripeSubscriptionId == null
          ? null
          : String(opts.stripeSubscriptionId);
    }
    return get(shopId);
  }

  function recordSyncSummary(shopId, summary) {
    const row = rows.find((r) => r.shopId === String(shopId));
    if (!row) {
      const err = new Error('shop_not_found');
      err.code = 'shop_not_found';
      throw err;
    }
    if (summary && summary.lastSyncAt !== undefined) {
      row.lastSyncAt = summary.lastSyncAt;
    }
    if (summary && summary.nextSyncAt !== undefined) {
      row.nextSyncAt = summary.nextSyncAt;
    }
    if (summary && summary.partsCount !== undefined) {
      row.partsCount = Number(summary.partsCount) || 0;
    }
    if (summary && summary.lastSyncResult !== undefined) {
      row.lastSyncResult =
        summary.lastSyncResult == null ? null : String(summary.lastSyncResult);
    }
    return get(shopId);
  }
  return {
    insert,
    upsertConnect,
    get,
    getByShopId,
    getByProviderShopId,
    setCredentialRef,
    transition,
    updateStatus,
    deleteByShopId,
    statusLog,
    listByMerchant,
    listPublic,
    setSubscriptionStatus,
    recordSyncSummary,
  };
}

module.exports = {
  MERCHANT_SHOP_PROVIDERS,
  ShopConflictError,
  ShopTransitionError,
  createShopsRegistry,
  newShopId,
  assertProvider,
};
