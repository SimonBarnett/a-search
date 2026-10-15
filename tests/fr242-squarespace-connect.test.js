'use strict';

/**
 * FR-242 / #1356: Squarespace OAuth offline refresh + API-key fallback + catalog normalize.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-242.md');

const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
  getAdapter,
} = require('../shared/shops/connect');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  apiKeyFallbackEnabled,
  SCOPES,
} = require('../shared/shops/adapters/squarespace');
const {
  refreshAccessToken,
  runSquarespaceKeepAlive,
} = require('../providers/local/squarespace/src/token');
const {
  fetchAllProducts,
} = require('../providers/local/squarespace/src/catalog');
const {
  normalizeSquarespaceCatalog,
  loadFixtureProducts,
} = require('../providers/local/squarespace/src/normalize');

const CLIENT_ID = 'sq_client_test';
const CLIENT_SECRET = 'sq_secret_test';

describe('FR-242 squarespace connect', () => {
  it('Decision LOCKED docs ASCII + adapter registered + registry entry', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-242.md must be ASCII');
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /access_type=offline|offline refresh/i);
    assert.match(fr, /SQUARESPACE_API_KEY_FALLBACK/);
    assert.match(fr, /FR-251|a_search/);
    assert.equal(
      getAdapter('squarespace'),
      require('../shared/shops/adapters/squarespace'),
    );
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const providers = Array.isArray(reg)
      ? reg
      : reg.sources || reg.providers || [];
    const sq = providers.find((p) => p.id === 'squarespace');
    assert.ok(sq);
    assert.equal(sq.kind, 'local');
    assert.equal(sq.class, 'merchant');
    assert.equal(sq.folder, 'providers/local/squarespace');
    assert.equal(sq.enabled.live, false);
    assert.equal(apiKeyFallbackEnabled({}), true);
    assert.equal(
      apiKeyFallbackEnabled({ SQUARESPACE_API_KEY_FALLBACK: 'false' }),
      false,
    );
    assert.match(SCOPES, /website\.products\.read/);
  });

  it('startConnect builds authorize URL with offline access', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const started = await startConnect({
      merchantUserId: 'MERCH_SQ',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      callbackBaseUrl:
        'https://api.example/merchant/shops/callback/squarespace',
      nowMs: 1000,
    });
    assert.match(
      started.redirectUrl,
      /login\.squarespace\.com\/api\/1\/login\/oauth\/provider\/authorize/,
    );
    assert.match(started.redirectUrl, /client_id=sq_client_test/);
    assert.match(started.redirectUrl, /access_type=offline/);
    assert.match(started.redirectUrl, /website\.products\.read/);
    assert.match(started.redirectUrl, /state=/);
    assert.equal(shops.listByMerchant('MERCH_SQ', 'sandbox').length, 0);
  });

  it('OAuth callback valid state => pending_payment + vault refresh; bad state no row', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH_SQ',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 2000,
    });

    const httpRequest = async (req) => {
      if (String(req.url).includes('/oauth/provider/tokens')) {
        return {
          statusCode: 200,
          body: {
            access_token: 'sq_access_NEW',
            refresh_token: 'sq_refresh_NEW',
          },
        };
      }
      if (String(req.url).includes('/authorization/website')) {
        return {
          statusCode: 200,
          body: {
            website: {
              id: 'site_abc',
              domain: 'demo.squarespace.com',
              title: 'Demo SQ',
              currency: 'GBP',
            },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };

    const done = await completeConnect({
      provider: 'squarespace',
      state: started.state,
      req: { query: { code: 'auth_code_1' } },
      adapterOpts: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        httpRequest,
        vault,
        callbackBaseUrl:
          'https://api.smartcatalogue.uk/merchant/shops/callback/squarespace',
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 3000,
    });
    const shop = done.shop;
    assert.equal(shop.status, 'pending_payment');
    assert.equal(shop.provider, 'squarespace');
    assert.equal(shop.providerShopId, 'site_abc');
    const full = shops.get(shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'oauth');
    assert.equal(creds.refreshToken, 'sq_refresh_NEW');
    assert.ok(!JSON.stringify(shop).includes('sq_refresh_NEW'));

    await assert.rejects(
      () =>
        completeConnect({
          provider: 'squarespace',
          state: 'bogus-state',
          req: { query: { code: 'x' } },
          adapterOpts: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            httpRequest,
            vault,
          },
          nonces,
          shops,
          subscribeBaseUrl: 'https://example/subscribe',
          nowMs: 4000,
        }),
      (err) =>
        err &&
        (err.code === 'invalid_state' ||
          err.code === 'nonce_expired' ||
          err.code === 'provider_mismatch'),
    );
    assert.equal(shops.listByMerchant('MERCH_SQ', 'sandbox').length, 1);
  });

  it('token rotation persists new refresh before reuse; keep-alive suspends on invalid', async () => {
    const vault = createCredentialsVault();
    const shops = createShopsRegistry();
    const row = shops.insert({
      merchantUserId: 'M1',
      env: 'live',
      provider: 'squarespace',
      providerShopId: 'site_rot',
      shopDomain: 'rot.squarespace.com',
      credentialsSecretRef: 'vault:squarespace:site_rot',
      nowMs: 1,
    });
    shops.transition(row.shopId, 'live', { nowMs: 2 });
    vault.put('vault:squarespace:site_rot', {
      kind: 'squarespace_oauth',
      authMethod: 'oauth',
      refreshToken: 'OLD_REFRESH',
      accessToken: 'OLD_ACCESS',
      refreshTokenStoredAt: 1,
    });

    let sawOld = false;
    const httpRequest = async (req) => {
      const body = JSON.parse(String(req.body || '{}'));
      if (body.refresh_token === 'OLD_REFRESH') {
        sawOld = true;
        return {
          statusCode: 200,
          body: {
            access_token: 'NEW_ACCESS',
            refresh_token: 'NEW_REFRESH',
          },
        };
      }
      if (body.refresh_token === 'NEW_REFRESH') {
        return {
          statusCode: 200,
          body: {
            access_token: 'NEWER_ACCESS',
            refresh_token: 'NEWER_REFRESH',
          },
        };
      }
      return { statusCode: 400, body: { error: 'invalid' } };
    };

    const r1 = await refreshAccessToken({
      vault,
      secretRef: 'vault:squarespace:site_rot',
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpRequest,
      nowMs: 10_000,
    });
    assert.equal(sawOld, true);
    assert.equal(r1.refreshToken, 'NEW_REFRESH');
    assert.equal(vault.get('vault:squarespace:site_rot').refreshToken, 'NEW_REFRESH');
    assert.notEqual(
      vault.get('vault:squarespace:site_rot').refreshToken,
      'OLD_REFRESH',
    );

    // Keep-alive with aged token + invalid refresh -> suspended(auth)
    vault.put('vault:squarespace:site_rot', {
      ...vault.get('vault:squarespace:site_rot'),
      refreshToken: 'DEAD',
      refreshTokenStoredAt: 1,
    });
    const notices = [];
    const ka = await runSquarespaceKeepAlive({
      shops,
      vault,
      shopIds: [row.shopId],
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpRequest: async () => ({ statusCode: 401, body: {} }),
      nowMs: 10 * 86400000,
      keepaliveDays: 5,
      sendNotice: async (n) => notices.push(n),
    });
    assert.ok(ka.results.some((x) => x.reason === 'suspended_auth'));
    assert.equal(shops.get(row.shopId).status, 'suspended');
    assert.ok(notices.some((n) => n.notice === 'reconnect'));
  });

  it('API key fallback validates Products call; disabled when flag false', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH_KEY',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 5000,
    });
    const httpRequest = async (req) => {
      if (String(req.url).includes('/commerce/products')) {
        return { statusCode: 200, body: { products: [] } };
      }
      if (String(req.url).includes('/authorization/website')) {
        return {
          statusCode: 200,
          body: {
            website: {
              id: 'site_key',
              domain: 'key.squarespace.com',
              title: 'Key Shop',
            },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };
    const done = await completeConnect({
      provider: 'squarespace',
      state: started.state,
      req: { body: { apiKey: 'sq_api_KEY_SECRET' } },
      adapterOpts: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        httpRequest,
        vault,
        env: { SQUARESPACE_API_KEY_FALLBACK: 'true' },
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 6000,
    });
    const shop = done.shop;
    assert.equal(shop.status, 'pending_payment');
    const full = shops.get(shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'api_key');
    assert.equal(creds.apiKey, 'sq_api_KEY_SECRET');
    assert.ok(!JSON.stringify(shop).includes('sq_api_KEY_SECRET'));

    const nonces2 = createNonceStore();
    const shops2 = createShopsRegistry();
    const started2 = await startConnect({
      merchantUserId: 'MERCH_KEY2',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: CLIENT_ID },
      nonces: nonces2,
      shops: shops2,
      nowMs: 7000,
    });
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'squarespace',
          state: started2.state,
          req: { body: { apiKey: 'x' } },
          adapterOpts: {
            clientId: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            httpRequest,
            vault,
            env: { SQUARESPACE_API_KEY_FALLBACK: 'false' },
          },
          nonces: nonces2,
          shops: shops2,
          subscribeBaseUrl: 'https://example/subscribe',
          nowMs: 8000,
        }),
      (err) => err && err.code === 'api_key_fallback_disabled',
    );
  });

  it('catalog cursor pagination + normalize absolute URLs; no secrets in staging', async () => {
    const fixture = loadFixtureProducts();
    const pages = [
      {
        products: [fixture[0]],
        pagination: { nextPageCursor: 'CUR2' },
      },
      {
        products: [fixture[1]],
        pagination: { nextPageCursor: null },
      },
    ];
    let pageIdx = 0;
    const httpRequest = async (req) => {
      assert.ok(req.headers['User-Agent'] || req.headers['user-agent']);
      const body = pages[pageIdx] || { products: [], pagination: {} };
      pageIdx += 1;
      return { statusCode: 200, body };
    };
    const all = await fetchAllProducts({
      accessToken: 'tok',
      httpRequest,
      maxPages: 5,
    });
    assert.equal(all.products.length, 2);
    assert.equal(all.pages, 2);

    const rows = normalizeSquarespaceCatalog(
      { products: fixture },
      {
        env: 'sandbox',
        feedKey: 'shp_test',
        siteDomain: 'demo.squarespace.com',
      },
    );
    assert.ok(rows.length >= 3, 'variants expand');
    for (const r of rows) {
      assert.equal(r.Source, 'squarespace');
      assert.equal(r.FeedKey, 'shp_test');
      assert.match(String(r.Url), /^https:\/\/demo\.squarespace\.com\//);
      assert.ok(r.ContentHash);
      assert.ok(!JSON.stringify(r).includes('sq_access'));
      assert.ok(!JSON.stringify(r).includes('refresh'));
    }
  });
});
