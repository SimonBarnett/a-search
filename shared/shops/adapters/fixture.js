'use strict';

/**
 * FR-216 fixture adapter: simulates platform logged-in session.
 * Real Shopify / Wix / Woo adapters land in FR-236 / FR-237 / FR-238.
 */

/**
 * @param {{
 *   shopDomain?: string,
 *   state: string,
 *   callbackBaseUrl?: string,
 *   session?: {
 *     loggedIn?: boolean,
 *     providerShopId?: string,
 *     shopDomain?: string,
 *     displayName?: string,
 *     scopes?: string[],
 *     credentials?: object,
 *   },
 * }} ctx
 */
async function startConnect(ctx) {
  const session = ctx.session || {};
  const callbackBase =
    ctx.callbackBaseUrl || 'https://api.example/merchant/shops/callback/fixture';
  if (!session.loggedIn) {
    return {
      redirectUrl: `https://fixture.example/login?return=${encodeURIComponent(
        `${callbackBase}?state=${encodeURIComponent(ctx.state)}`,
      )}`,
      loginRequired: true,
    };
  }
  return {
    redirectUrl: `${callbackBase}?state=${encodeURIComponent(ctx.state)}&code=fixture_ok`,
    loginRequired: false,
  };
}

/**
 * @param {object} req
 * @param {{
 *   state: string,
 *   shopDomain?: string,
 *   session?: object,
 * }} nonce
 */
async function completeConnect(req, nonce) {
  void req;
  const session = (nonce && nonce.session) || {};
  if (!session.loggedIn) {
    const err = new Error('login_required');
    err.code = 'login_required';
    throw err;
  }
  const shopDomain = String(
    session.shopDomain || nonce.shopDomain || 'fixture.example',
  );
  return {
    providerShopId: String(session.providerShopId || `fix_${shopDomain}`),
    shopDomain,
    displayName: String(session.displayName || shopDomain),
    scopes: Array.isArray(session.scopes) ? session.scopes.map(String) : ['read_products'],
    // Vault payload only -- never logged or returned on HTTP
    credentials: session.credentials || { kind: 'fixture', token: 'FAKE_TOKEN' },
  };
}

async function verifyWebhook() {
  return false;
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  startConnect,
  completeConnect,
  verifyWebhook,
  revoke,
};
