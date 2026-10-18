'use strict';

/**
 * FR-242: Squarespace Commerce OAuth (offline refresh) + optional API-key fallback.
 * Access tokens ~30m; refresh tokens 7d one-time-use — rotate vault atomically.
 */

const DEFAULT_AUTHORIZE =
  'https://login.squarespace.com/api/1/login/oauth/provider/authorize';
const DEFAULT_TOKEN_URL =
  'https://login.squarespace.com/api/1/login/oauth/provider/tokens';
const DEFAULT_API_BASE = 'https://api.squarespace.com';
const DEFAULT_CALLBACK =
  'https://api.smartcatalogue.uk/merchant/shops/callback/squarespace';
const SCOPES = 'website.products.read';
const USER_AGENT = 'a-search-squarespace/1.0 (+https://smartcatalogue.uk)';

/**
 * @param {string} domain
 * @returns {string}
 */
function normalizeSiteDomain(domain) {
  let raw = String(domain || '')
    .trim()
    .toLowerCase();
  raw = raw.replace(/^https?:\/\//, '');
  raw = raw.split('/')[0];
  return raw;
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function apiKeyFallbackEnabled(env) {
  const e = env || process.env;
  const v = e.SQUARESPACE_API_KEY_FALLBACK;
  if (v == null || v === '') return true;
  return String(v).toLowerCase() !== 'false' && String(v) !== '0';
}

/**
 * @param {{
 *   state: string,
 *   callbackBaseUrl?: string,
 *   clientId?: string,
 *   apiKey?: string,
 *   authorizeUrl?: string,
 * }} ctx
 */
async function startConnect(ctx) {
  const clientId = String(ctx.clientId || ctx.apiKey || '').trim();
  if (!clientId) {
    const err = new Error('squarespace_app_credentials_missing');
    err.code = 'squarespace_app_credentials_missing';
    throw err;
  }
  const redirectUri = String(ctx.callbackBaseUrl || DEFAULT_CALLBACK).trim();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state: String(ctx.state),
    access_type: 'offline',
  });
  const base = String(ctx.authorizeUrl || DEFAULT_AUTHORIZE).replace(/\/$/, '');
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
  const q = (req && (req.query || req.queryStringParameters || req.body || req)) || {};
  /** @type {Record<string, string>} */
  const flat = {};
  for (const [k, v] of Object.entries(q)) {
    if (v == null) continue;
    flat[String(k)] = Array.isArray(v) ? String(v[0]) : String(v);
  }

  const httpRequest =
    typeof nonce.httpRequest === 'function'
      ? nonce.httpRequest
      : async () => {
          throw new Error('httpRequest_required');
        };

  // API key fallback (Simon: allowed until OAuth client approved).
  const pastedKey = String(flat.apiKey || flat.api_key || '').trim();
  if (pastedKey) {
    if (!apiKeyFallbackEnabled(nonce.env || process.env)) {
      const err = new Error('api_key_fallback_disabled');
      err.code = 'api_key_fallback_disabled';
      throw err;
    }
    return completeWithApiKey(pastedKey, nonce, httpRequest, flat);
  }

  const code = String(flat.code || '').trim();
  if (!code) {
    const err = new Error('code_required');
    err.code = 'code_required';
    throw err;
  }

  const clientId = String(nonce.clientId || nonce.apiKey || '').trim();
  const clientSecret = String(nonce.clientSecret || nonce.apiSecret || '').trim();
  if (!clientId || !clientSecret) {
    const err = new Error('squarespace_app_credentials_missing');
    err.code = 'squarespace_app_credentials_missing';
    throw err;
  }

  const redirectUri = String(
    nonce.callbackBaseUrl || nonce.redirectUri || DEFAULT_CALLBACK,
  ).trim();
  const tokenUrl = String(nonce.tokenUrl || DEFAULT_TOKEN_URL);

  const tokenRes = await httpRequest({
    method: 'POST',
    url: tokenUrl,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': USER_AGENT,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const tokenBody = parseBody(tokenRes);
  const accessToken = tokenBody.access_token
    ? String(tokenBody.access_token)
    : '';
  const refreshToken = tokenBody.refresh_token
    ? String(tokenBody.refresh_token)
    : '';
  if (!accessToken || !refreshToken) {
    const err = new Error('token_exchange_failed');
    err.code = 'token_exchange_failed';
    throw err;
  }

  const site = await fetchSiteIdentity(httpRequest, accessToken, nonce.apiBase);
  const providerShopId = String(site.websiteId || site.id || site.domain);
  const shopDomain = normalizeSiteDomain(site.domain || site.primaryDomain || providerShopId);
  const displayName = String(site.title || site.siteTitle || shopDomain);
  const currency = site.currency ? String(site.currency) : null;

  const secretRef = `vault:squarespace:${providerShopId}`;
  const nowMs = nonce.nowMs != null ? Number(nonce.nowMs) : Date.now();
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'squarespace_oauth',
      authMethod: 'oauth',
      websiteId: providerShopId,
      shopDomain,
      refreshToken,
      // access token is short-lived; keep for immediate first sync only
      accessToken,
      accessTokenExpiresAt: nowMs + 30 * 60 * 1000,
      refreshTokenStoredAt: nowMs,
      currency,
      scope: SCOPES,
    });
  }

  return {
    providerShopId,
    shopDomain,
    displayName,
    scopes: SCOPES.split(/[,\s]+/).filter(Boolean),
    credentials: { secretRef },
    authMethod: 'oauth',
  };
}

/**
 * @param {string} apiKey
 * @param {object} nonce
 * @param {Function} httpRequest
 * @param {Record<string, string>} flat
 */
async function completeWithApiKey(apiKey, nonce, httpRequest, flat) {
  const apiBase = String(nonce.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  // Validate with one Products call (read-only).
  const probe = await httpRequest({
    method: 'GET',
    url: `${apiBase}/v2/commerce/products?limit=1`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  const status = Number(probe && probe.statusCode) || 0;
  if (status < 200 || status >= 300) {
    const err = new Error('api_key_invalid');
    err.code = 'api_key_invalid';
    throw err;
  }

  let site = {
    websiteId: flat.websiteId || flat.siteId || '',
    domain: flat.shopDomain || flat.domain || '',
    title: flat.displayName || '',
    currency: flat.currency || null,
  };
  try {
    site = {
      ...site,
      ...(await fetchSiteIdentity(httpRequest, apiKey, apiBase)),
    };
  } catch {
    // identity best-effort for API keys
  }
  const providerShopId = String(
    site.websiteId || site.id || site.domain || `key_${hashShort(apiKey)}`,
  );
  const shopDomain = normalizeSiteDomain(
    site.domain || site.primaryDomain || flat.shopDomain || providerShopId,
  );
  const displayName = String(site.title || site.siteTitle || shopDomain);
  const secretRef = `vault:squarespace:${providerShopId}`;
  const nowMs = nonce.nowMs != null ? Number(nonce.nowMs) : Date.now();
  if (nonce.vault && typeof nonce.vault.put === 'function') {
    nonce.vault.put(secretRef, {
      kind: 'squarespace_api_key',
      authMethod: 'api_key',
      websiteId: providerShopId,
      shopDomain,
      apiKey,
      refreshTokenStoredAt: nowMs,
      currency: site.currency ? String(site.currency) : null,
      reconnectOauthPreferred: true,
    });
  }
  return {
    providerShopId,
    shopDomain,
    displayName,
    scopes: ['products.read'],
    credentials: { secretRef },
    authMethod: 'api_key',
  };
}

function hashShort(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function parseBody(res) {
  if (res && res.body && typeof res.body === 'object') return res.body;
  try {
    return JSON.parse(String((res && res.body) || '{}'));
  } catch {
    return {};
  }
}

/**
 * @param {Function} httpRequest
 * @param {string} accessToken
 * @param {string} [apiBase]
 */
async function fetchSiteIdentity(httpRequest, accessToken, apiBase) {
  const base = String(apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
  // Profiles / website endpoints vary; injectable fixtures return a synthetic site.
  const res = await httpRequest({
    method: 'GET',
    url: `${base}/v2/authorization/website`,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
  });
  const body = parseBody(res);
  const website = body.website || body.site || body;
  return {
    websiteId: website.id || website.websiteId || website.siteId,
    domain: website.domain || website.primaryDomain || website.url,
    title: website.title || website.siteTitle || website.name,
    currency: website.currency || (website.store && website.store.currency),
    primaryDomain: website.primaryDomain || website.domain,
  };
}

async function revoke() {
  return { revoked: true };
}

module.exports = {
  DEFAULT_AUTHORIZE,
  DEFAULT_TOKEN_URL,
  DEFAULT_API_BASE,
  DEFAULT_CALLBACK,
  SCOPES,
  USER_AGENT,
  normalizeSiteDomain,
  apiKeyFallbackEnabled,
  startConnect,
  completeConnect,
  fetchSiteIdentity,
  revoke,
};
