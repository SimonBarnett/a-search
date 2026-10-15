'use strict';

/**
 * FR-245 / #1359: BigCommerce app OAuth + signed_payload_jwt + catalog normalize.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-245.md');

const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
  getAdapter,
} = require('../shared/shops/connect');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  SCOPES,
  signPayloadJwt,
  verifySignedPayloadJwt,
  storeHashFromContext,
} = require('../shared/shops/adapters/bigcommerce');
const {
  matchBigCommerceWebhookRoute,
  handleBigCommerceWebhook,
} = require('../entry/src/bigcommerceWebhooks');
const {
  normalizeBigCommerceCatalog,
  loadFixtureProducts,
} = require('../providers/local/bigcommerce/src/normalize');
const {
  fetchProductsPage,
  fetchAllProducts,
} = require('../providers/local/bigcommerce/src/catalog');

const CLIENT_ID = 'bc_client_test';
const CLIENT_SECRET = 'bc_secret_test';

describe('FR-245 bigcommerce connect', () => {
  it('Decision LOCKED docs ASCII + adapter + registry + CDK webhook routes', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-245.md must be ASCII');
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /non-expiring/i);
    assert.match(fr, /signed_payload_jwt/i);
    assert.match(fr, /No migrate-legacy-bigcommerce/i);
    assert.match(fr, /FR-251|a_search/);
    assert.equal(
      getAdapter('bigcommerce'),
      require('../shared/shops/adapters/bigcommerce'),
    );
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const sources = reg.sources || [];
    const row = sources.find((p) => p.id === 'bigcommerce');
    assert.ok(row);
    assert.equal(row.kind, 'local');
    assert.equal(row.class, 'merchant');
    assert.equal(row.merchantConnect, true);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.queueEnv, 'SQS_BIGCOMMERCE_URL');
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/webhooks\/shop\/bigcommerce\/uninstall'/);
    assert.match(stack, /path:\s*'\/webhooks\/shop\/bigcommerce\/load'/);
    assert.equal(
      matchBigCommerceWebhookRoute(
        'POST',
        '/webhooks/shop/bigcommerce/uninstall',
      ),
      'POST /webhooks/shop/bigcommerce/uninstall',
    );
    assert.match(SCOPES, /store_v2_products_read_only/);
  });

  it('startConnect builds install deep-link with state; missing client id fails', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const started = await startConnect({
      merchantUserId: 'MERCH_BC',
      env: 'sandbox',
      provider: 'bigcommerce',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      callbackBaseUrl:
        'https://api.example/merchant/shops/callback/bigcommerce',
      nowMs: 1000,
    });
    assert.match(started.redirectUrl, /login\.bigcommerce\.com\/deep-links\/install/);
    assert.match(started.redirectUrl, new RegExp(CLIENT_ID));
    assert.match(started.redirectUrl, /state=/);
    assert.match(started.callbackUrl, /callback\/bigcommerce/);
    assert.equal(shops.listByMerchant('MERCH_BC', 'sandbox').length, 0);

    await assert.rejects(
      () =>
        startConnect({
          merchantUserId: 'MERCH_BC2',
          env: 'sandbox',
          provider: 'bigcommerce',
          adapterOpts: {},
          nonces,
          shops,
          nowMs: 1100,
        }),
      (e) => e && e.code === 'bigcommerce_app_credentials_missing',
    );
  });

  it('OAuth callback valid state => pending_payment + vault; bad state no row', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH_BC',
      env: 'sandbox',
      provider: 'bigcommerce',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 2000,
    });

    const httpRequest = async (req) => {
      if (String(req.url).includes('/oauth2/token')) {
        const body = JSON.parse(String(req.body || '{}'));
        assert.equal(body.grant_type, 'authorization_code');
        assert.equal(body.client_id, CLIENT_ID);
        assert.ok(!JSON.stringify(req).includes('never_log_me'));
        return {
          statusCode: 200,
          body: {
            access_token: 'bc_access_SECRET',
            scope: SCOPES,
            context: 'stores/abc123hash',
            user: { email: 'owner@example.com' },
          },
        };
      }
      if (String(req.url).includes('/v2/store')) {
        assert.equal(req.headers['X-Auth-Token'], 'bc_access_SECRET');
        return {
          statusCode: 200,
          body: {
            name: 'Demo BC',
            domain: 'demo.mybigcommerce.com',
            secure_url: 'https://demo.mybigcommerce.com',
            currency: 'GBP',
          },
        };
      }
      return { statusCode: 404, body: {} };
    };

    const done = await completeConnect({
      provider: 'bigcommerce',
      state: started.state,
      req: {
        query: {
          code: 'auth_code_1',
          context: 'stores/abc123hash',
          scope: SCOPES,
        },
      },
      adapterOpts: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        httpRequest,
        vault,
        callbackBaseUrl:
          'https://api.smartcatalogue.uk/merchant/shops/callback/bigcommerce',
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 3000,
    });
    const shop = done.shop;
    assert.equal(shop.status, 'pending_payment');
    assert.equal(shop.provider, 'bigcommerce');
    assert.equal(shop.providerShopId, 'abc123hash');
    const full = shops.get(shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'oauth');
    assert.equal(creds.accessToken, 'bc_access_SECRET');
    assert.equal(creds.accessTokenExpiresAt, null);
    assert.equal(creds.storeHash, 'abc123hash');
    assert.ok(!JSON.stringify(shop).includes('bc_access_SECRET'));
    assert.ok(!JSON.stringify(shop).includes(CLIENT_SECRET));

    await assert.rejects(
      () =>
        completeConnect({
          provider: 'bigcommerce',
          state: 'bogus-state',
          req: { query: { code: 'x', context: 'stores/x' } },
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
    assert.equal(shops.listByMerchant('MERCH_BC', 'sandbox').length, 1);
  });

  it('signed_payload_jwt: valid, bad signature, wrong aud', () => {
    const payload = {
      aud: CLIENT_ID,
      sub: 'stores/abc123hash',
      user: { id: 1 },
      owner: { id: 1 },
    };
    const token = signPayloadJwt(payload, CLIENT_SECRET);
    const ok = verifySignedPayloadJwt(token, CLIENT_SECRET, {
      expectedAud: CLIENT_ID,
    });
    assert.ok(ok);
    assert.equal(storeHashFromContext(ok.sub), 'abc123hash');

    const badSig = token.slice(0, -4) + 'xxxx';
    assert.equal(
      verifySignedPayloadJwt(badSig, CLIENT_SECRET, { expectedAud: CLIENT_ID }),
      null,
    );
    assert.equal(
      verifySignedPayloadJwt(token, CLIENT_SECRET, {
        expectedAud: 'other_client',
      }),
      null,
    );
  });

  it('uninstall webhook suspends shop; load acks; invalid jwt 401', async () => {
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const inserted = shops.insert({
      merchantUserId: 'M1',
      env: 'live',
      provider: 'bigcommerce',
      providerShopId: 'abc123hash',
      shopDomain: 'demo.mybigcommerce.com',
      displayName: 'Demo',
      status: 'active',
      credentialsSecretRef: 'vault:bigcommerce:abc123hash',
    });
    vault.put('vault:bigcommerce:abc123hash', {
      accessToken: 'tok',
      storeHash: 'abc123hash',
    });

    const token = signPayloadJwt(
      { aud: CLIENT_ID, sub: 'stores/abc123hash', operation: 'uninstall' },
      CLIENT_SECRET,
    );
    let cancelled = false;
    const uninstallRes = await handleBigCommerceWebhook(
      {
        rawPath: '/webhooks/shop/bigcommerce/uninstall',
        requestContext: {
          http: {
            method: 'POST',
            path: '/webhooks/shop/bigcommerce/uninstall',
          },
        },
        body: JSON.stringify({ signed_payload_jwt: token }),
      },
      {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        shops,
        vault,
        cancelSubscription: async () => {
          cancelled = true;
          return { cancelled: true };
        },
      },
    );
    assert.equal(uninstallRes.statusCode, 200);
    assert.equal(shops.get(inserted.shopId).status, 'suspended');
    assert.equal(cancelled, true);

    const loadTok = signPayloadJwt(
      { aud: CLIENT_ID, sub: 'stores/abc123hash', operation: 'load' },
      CLIENT_SECRET,
    );
    const loadRes = await handleBigCommerceWebhook(
      {
        rawPath: '/webhooks/shop/bigcommerce/load',
        requestContext: {
          http: { method: 'POST', path: '/webhooks/shop/bigcommerce/load' },
        },
        body: JSON.stringify({ signed_payload_jwt: loadTok }),
      },
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, shops, vault },
    );
    assert.equal(loadRes.statusCode, 200);
    assert.match(String(loadRes.body), /"operation":"load"/);

    const bad = await handleBigCommerceWebhook(
      {
        rawPath: '/webhooks/shop/bigcommerce/uninstall',
        requestContext: {
          http: {
            method: 'POST',
            path: '/webhooks/shop/bigcommerce/uninstall',
          },
        },
        body: JSON.stringify({ signed_payload_jwt: 'not.a.jwt' }),
      },
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, shops, vault },
    );
    assert.equal(bad.statusCode, 401);
  });

  it('normalize fixture: absolute URLs + product id; skip invisible; no secrets', () => {
    const items = loadFixtureProducts();
    const rows = normalizeBigCommerceCatalog(
      { data: items },
      {
        env: 'sandbox',
        feedKey: 'shp_bc',
        shopDomain: 'demo.mybigcommerce.com',
        currency: 'GBP',
      },
    );
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.Source, 'bigcommerce');
      assert.equal(r.FeedKey, 'shp_bc');
      assert.ok(r.MerchantProductId);
      assert.match(String(r.Url), /^https:\/\/demo\.mybigcommerce\.com\//);
      assert.ok(r.ContentHash);
      assert.ok(!JSON.stringify(r).includes('access_token'));
      assert.ok(!JSON.stringify(r).includes('secret'));
    }
    const mug = rows.find((r) => r.MerchantProductId === '77');
    assert.ok(mug);
    assert.equal(mug.Price, 12.5);
    const hat = rows.find((r) => r.MerchantProductId === '88');
    assert.ok(hat);
    assert.equal(hat.Price, 18);
  });

  it('catalog pagination + 401 unauthorized', async () => {
    let pages = 0;
    const httpRequest = async (req) => {
      pages += 1;
      assert.match(req.url, /is_visible=true/);
      assert.match(req.url, /limit=1/);
      assert.equal(req.headers['X-Auth-Token'], 'tok');
      if (pages === 1) {
        return {
          statusCode: 200,
          body: {
            data: [{ id: 1, name: 'A', is_visible: true, price: 1 }],
            meta: { pagination: { total: 2, total_pages: 2, per_page: 1 } },
          },
          headers: { 'x-rate-limit-requests-left': '10' },
        };
      }
      return {
        statusCode: 200,
        body: {
          data: [{ id: 2, name: 'B', is_visible: true, price: 2 }],
          meta: { pagination: { total: 2, total_pages: 2, per_page: 1 } },
        },
      };
    };
    const all = await fetchAllProducts({
      storeHash: 'h1',
      accessToken: 'tok',
      httpRequest,
      limit: 1,
    });
    assert.equal(all.products.length, 2);

    await assert.rejects(
      () =>
        fetchProductsPage({
          storeHash: 'h1',
          accessToken: 'bad',
          httpRequest: async () => ({ statusCode: 401, body: {} }),
        }),
      (e) => e && e.code === 'bigcommerce_unauthorized',
    );
  });
});
