'use strict';

/**
 * FR-237: Wix app-install adapter (instanceId + Create Access Token).
 * Auth model (2024+): external install -> instanceId; mint short-lived tokens via
 * POST /oauth2/token grant_type=client_credentials + instance_id (no pasted keys).
 * Legacy refresh_token may be stored when present; access tokens are never vaulted.
 */

const crypto = require('node:crypto');

const DEFAULT_INSTALL_BASE = 'https://www.wix.com/installer/install';
const DEFAULT_TOKEN_URL = 'https://www.wixapis.com/oauth2/token';
const DEFAULT_INSTANCE_URL = 'https://www.wixapis.com/apps/v1/instance';
const DEFAULT_CALLBACK =
  'https://api.smartcatalogue.uk/merchant/shops/callback/wix';

/**
 * Sign instance payload the way tests / classic Wix App Instance expect:
 * base64url(JSON).base64url(hmac-sha256(secret, payload)).
 * @param {object} payload
 * @param {string} secret
 * @returns {string}
 */
function signWixInstance(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString(
    'base64url',
  );
  const sig = crypto
    .createHmac('sha256', String(secret))
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

/**
 * Verify signedInstance (classic two-part HMAC or three-part JWT HS256).
 * @param {string} signedInstance
 * @param {string} secret
 * @returns {object|null} decoded payload or null
 */
function verifyWixSignedInstance(signedInstance, secret) {
  const raw = String(signedInstance || '').trim();
  const sec = String(secret || '');
  if (!raw || !sec) return null;
  const parts = raw.split('.');
  try {
    if (parts.length === 2) {
      const [body, sig] = parts;
      const expect = crypto
        .createHmac('sha256', sec)
        .update(body)
        .digest('base64url');
      const a = Buffer.from(expect);
      const b = Buffer.from(String(sig));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    }
    if (parts.length === 3) {
      const [h, p, s] = parts;
      const data = `${h}.${p}`;
      const expect = crypto
        .createHmac('sha256', sec)
        .update(data)
        .digest('base64url');
      const a = Buffer.from(expect);
      const b = Buffer.from(String(s));
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
      return JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Webhook body HMAC (hex) with app secret — testable stand-in; production may
 * also verify JWT with the Wix public key (injectable verifyWebhookJwt).
 * @param {string|Buffer} rawBody
 * @param {string} headerHmac
 * @param {string} secret
 */
function verifyWixWebhookHmac(rawBody, headerHmac, secret) {
  if (!headerHmac || !secret) return false;
  const digest = crypto
    .createHmac('sha256', String(secret))
    .update(rawBody == null ? '' : rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest, 'utf8'),
      Buffer.from(String(headerHmac), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   state: string,
 *   callbackBaseUrl?: string,
 *   clientId?: string,
 *   appId?: string,
 *   apiKey?: string,
 *   installBaseUrl?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const appId = String(ctx.clientId || ctx.appId || ctx.apiKey || '').trim();
  if (!appId) {
    const err = new Error('wix_app_credentials_missing');
    err.code = 'wix_app_credentials_missing';
    throw err;
  }
  const redirectUrl = String(ctx.callbackBaseUrl || DEFAULT_CALLBACK).trim();
  const base = String(ctx.installBaseUrl || DEFAULT_INSTALL_BASE).replace(
    /\/$/,
    '',
  );
  const params = new URLSearchParams({
    appId,
    redirectUrl,
    state: String(ctx.state),
  });
  return {
    redirectUrl: `${base}?${params.toString()}`,
    loginRequired: true,
  };
}

/**
 * @param {object} req
 * @param {object} nonce
 */
async function completeConnect(req, nonce) {
  const q = (req && (req.query || req.queryStringParameters || req)) || {};
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    flat[String(k)] = Array.isArray(v) ? String(v[0]) : String(v);
  }

  const secret = String(
    (nonce && (nonce.clientSecret || nonce.appSecret || nonce.apiSecret)) || '',
  ).trim();
  const appId = String(
    (nonce && (nonce.clientId || nonce.appId || nonce.apiKey)) || '',
  ).trim();
  if (!secret || !appId) {
    const err = new Error('wix_app_credentials_missing');
    err.code = 'wix_app_credentials_missing';
    throw err;
  }

  const signed = String(flat.signedInstance || flat.instance || '').trim();
  const verify =
    typeof nonce.verifySignedInstance === 'function'
      ? nonce.verifySignedInstance
      : verifyWixSignedInstance;
  const decoded = signed ? verify(signed, secret) : null;
  if (!decoded || typeof decoded !== 'object') {
    const err = new Error('invalid_signed_instance');
    err.code = 'invalid_signed_instance';
    throw err;
  }

  const instanceId = String(
    decoded.instanceId ||
      decoded.instance_id ||
      flat.instanceId ||
      '',
  ).trim();
  if (!instanceId) {
    const err = new Error('instance_id_required');
    err.code = 'instance_id_required';
    throw err;
  }

  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  // Optional site metadata (best-effort).
  let siteId = String(flat.tenantId || decoded.siteId || decoded.metaSiteId || '').trim();
  let shopDomain = siteId ? `${siteId}.wixsite.com` : `wix-instance-${instanceId}`;
  let displayName = shopDomain;

  try {
    const tokenRes = await httpRequest({
      method: 'POST',
      url: String(nonce.tokenUrl || DEFAULT_TOKEN_URL),
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: appId,
        client_secret: secret,
        instance_id: instanceId,
      }),
    });
    const tokenBody =
      tokenRes && tokenRes.body && typeof tokenRes.body === 'object'
        ? tokenRes.body
        : (() => {
            try {
              return JSON.parse(String((tokenRes && tokenRes.body) || '{}'));
            } catch {
              return {};
            }
          })();
    const accessToken = tokenBody.access_token
      ? String(tokenBody.access_token)
      : '';
    if (accessToken) {
      try {
        const instRes = await httpRequest({
          method: 'GET',
          url: String(nonce.instanceUrl || DEFAULT_INSTANCE_URL),
          headers: {
            Authorization: accessToken,
            accept: 'application/json',
          },
        });
        const inst =
          instRes && instRes.body && typeof instRes.body === 'object'
            ? instRes.body
            : JSON.parse(String((instRes && instRes.body) || '{}'));
        const site = inst.site || inst.instance || inst;
        if (site && site.siteDisplayName) {
          displayName = String(site.siteDisplayName);
        } else if (site && site.displayName) {
          displayName = String(site.displayName);
        }
        if (site && (site.url || site.siteUrl)) {
          shopDomain = String(site.url || site.siteUrl)
            .replace(/^https?:\/\//, '')
            .split('/')[0]
            .toLowerCase();
        }
        if (site && (site.siteId || site.metaSiteId)) {
          siteId = String(site.siteId || site.metaSiteId);
        }
      } catch {
        // metadata best-effort
      }
    }
  } catch {
    // Token mint at connect is optional for vaulting instanceId; catalog uses token.js later.
  }

  const secretRef = `vault:wix:${instanceId}`;
  const refreshToken =
    flat.refreshToken || decoded.refreshToken
      ? String(flat.refreshToken || decoded.refreshToken)
      : null;

  if (nonce.vault && typeof nonce.vault.put === 'function') {
    const payload = {
      kind: 'wix_instance',
      instanceId,
      siteId: siteId || null,
      shopDomain,
      // Access tokens are minted on demand (token.js); never persist them here.
      refreshToken: refreshToken || undefined,
      storedAt: nonce.nowMs != null ? Number(nonce.nowMs) : Date.now(),
    };
    if (!payload.refreshToken) delete payload.refreshToken;
    nonce.vault.put(secretRef, payload);
  }

  return {
    providerShopId: instanceId,
    shopDomain,
    displayName,
    scopes: ['stores.read'],
    credentials: { secretRef },
  };
}

async function verifyWebhook(req, opts) {
  const secret = String(
    (opts && (opts.clientSecret || opts.appSecret || opts.apiSecret)) || '',
  );
  const header =
    (req &&
      req.headers &&
      (req.headers['x-wix-signature'] ||
        req.headers['X-Wix-Signature'] ||
        req.headers['x-wix-hmac-sha256'])) ||
    '';
  const raw = (req && (req.rawBody != null ? req.rawBody : req.body)) || '';
  if (typeof opts.verifyWebhookJwt === 'function') {
    return opts.verifyWebhookJwt(raw, req && req.headers);
  }
  return verifyWixWebhookHmac(raw, String(header), secret);
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  DEFAULT_INSTALL_BASE,
  DEFAULT_TOKEN_URL,
  signWixInstance,
  verifyWixSignedInstance,
  verifyWixWebhookHmac,
  startConnect,
  completeConnect,
  verifyWebhook,
  revoke,
};
