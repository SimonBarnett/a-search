'use strict';

/**
 * FR-216: merchant shop connect orchestration.
 * POST start -> nonce + provider redirectUrl; callback -> adapter + Shops row.
 * Credentials never returned to the browser or logged here.
 */

const { createNonceStore } = require('./nonceStore');
const { createShopsRegistry } = require('./registry');
const { getAdapter } = require('./adapters');

/**
 * @param {{
 *   merchantUserId: string,
 *   env: string,
 *   provider: string,
 *   shopDomain?: string,
 *   adapterOpts?: object,
 *   nonces: ReturnType<typeof createNonceStore>,
 *   shops: ReturnType<typeof createShopsRegistry>,
 *   nowMs?: number,
 *   callbackBaseUrl?: string,
 * }} args
 */
async function startConnect(args) {
  const provider = String(args.provider || '')
    .trim()
    .toLowerCase();
  if (!provider) {
    const err = new Error('provider_required');
    err.code = 'provider_required';
    throw err;
  }
  const adapter = getAdapter(provider);
  const state = args.nonces.create({
    merchantUserId: args.merchantUserId,
    env: args.env,
    provider,
    shopDomain: args.shopDomain,
    nowMs: args.nowMs,
  });
  const started = await adapter.startConnect({
    state,
    shopDomain: args.shopDomain,
    callbackBaseUrl: args.callbackBaseUrl,
    ...(args.adapterOpts || {}),
  });
  if (!started || !started.redirectUrl) {
    const err = new Error('empty_connect');
    err.code = 'empty_connect';
    throw err;
  }
  return {
    state,
    redirectUrl: String(started.redirectUrl),
    loginRequired: started.loginRequired === true,
    callbackUrl: started.callbackUrl,
    identityLinkUrl: started.identityLinkUrl,
    instructions: started.instructions,
  };
}

/**
 * @param {{
 *   provider: string,
 *   state: string,
 *   req: object,
 *   adapterOpts?: object,
 *   nonces: ReturnType<typeof createNonceStore>,
 *   shops: ReturnType<typeof createShopsRegistry>,
 *   nowMs?: number,
 *   subscribeBaseUrl: string,
 * }} args
 */
async function completeConnect(args) {
  const provider = String(args.provider || '')
    .trim()
    .toLowerCase();
  const nonce = args.nonces.consume({
    state: args.state,
    provider,
    nowMs: args.nowMs,
  });
  const adapter = getAdapter(provider);
  const completed = await adapter.completeConnect(args.req || {}, {
    ...nonce,
    nowMs: args.nowMs,
    ...(args.adapterOpts || {}),
  });
  if (
    !completed ||
    !completed.providerShopId ||
    !completed.shopDomain
  ) {
    const err = new Error('empty_connect');
    err.code = 'empty_connect';
    throw err;
  }
  // Never log credentials; store vault pointer only when provided as ref.
  const secretRef =
    completed.credentials && completed.credentials.secretRef
      ? String(completed.credentials.secretRef)
      : completed.credentials
        ? `vault:pending:${provider}:${completed.providerShopId}`
        : null;

  const shop = args.shops.insert({
    merchantUserId: nonce.merchantUserId,
    env: nonce.env,
    provider,
    providerShopId: completed.providerShopId,
    shopDomain: completed.shopDomain,
    displayName: completed.displayName,
    scopes: completed.scopes,
    credentialsSecretRef: secretRef,
    nowMs: args.nowMs,
  });

  const base = String(args.subscribeBaseUrl || '').replace(/\/$/, '');
  const redirectTo = `${base}?shopId=${encodeURIComponent(shop.shopId)}`;

  return {
    shop: {
      shopId: shop.shopId,
      merchantUserId: shop.merchantUserId,
      env: shop.env,
      provider: shop.provider,
      providerShopId: shop.providerShopId,
      shopDomain: shop.shopDomain,
      displayName: shop.displayName,
      scopes: shop.scopes,
      status: shop.status,
    },
    redirectTo,
  };
}

module.exports = {
  createNonceStore,
  createShopsRegistry,
  getAdapter,
  startConnect,
  completeConnect,
};
