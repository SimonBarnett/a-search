'use strict';

/**
 * FR-246 / #1360: Ecwid app OAuth + webhook HMAC + catalog normalize.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-246.md');

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
  signWebhookPayload,
  verifyWebhookSignature,
} = require('../shared/shops/adapters/ecwid');
const {
  matchEcwidWebhookRoute,
  handleEcwidWebhook,
} = require('../entry/src/ecwidWebhooks');
const {
  normalizeEcwidCatalog,
  loadFixtureProducts,
} = require('../providers/local/ecwid/src/normalize');
const {
  fetchProductsPage,
  fetchAllProducts,
} = require('../providers/local/ecwid/src/catalog');

const CLIENT_ID = 'ecwid_client_test';
const CLIENT_SECRET = 'ecwid_secret_test';

describe('FR-246 ecwid connect', () => {
  it('Decision LOCKED docs ASCII + adapter + registry + CDK webhook route', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-246.md must be ASCII');
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /non-expiring/i);
    assert.match(fr, /store_id/i);
    assert.match(fr, /application\/x-www-form-urlencoded|form body/i);
    assert.match(fr, /never GET|never query/i);
    assert.match(fr, /X-Ecwid-Webhook-Signature|HMAC-SHA256/i);
    assert.match(fr, /FR-251|a_search/);
    assert.equal(
      getAdapter('ecwid'),
      require('../shared/shops/adapters/ecwid'),
    );
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const sources = reg.sources || [];
    const row = sources.find((p) => p.id === 'ecwid');
    assert.ok(row);
    assert.equal(row.kind, 'local');
    assert.equal(row.class, 'merchant');
    assert.equal(row.merchantConnect, true);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.queueEnv, 'SQS_ECWID_URL');
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/webhooks\/shop\/ecwid'/);
    assert.equal(
      matchEcwidWebhookRoute('POST', '/webhooks/shop/ecwid'),
      'POST /webhooks/shop/ecwid',
    );
    assert.match(SCOPES, /read_catalog/);
  });

  it('startConnect builds authorize URL with scopes; missing client id fails', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const started = await startConnect({
      merchantUserId: 'MERCH_EC',
      env: 'sandbox',
      provider: 'ecwid',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      callbackBaseUrl: 'https://api.example/merchant/shops/callback/ecwid',
      nowMs: 1000,
    });
    assert.match(started.redirectUrl, /my\.ecwid\.com\/api\/oauth\/authorize/);
    assert.match(started.redirectUrl, /client_id=ecwid_client_test/);
    assert.match(started.redirectUrl, /response_type=code/);
    assert.match(started.redirectUrl, /read_store_profile/);
    assert.match(started.redirectUrl, /read_catalog/);
    assert.match(started.redirectUrl, /state=/);
    assert.equal(shops.listByMerchant('MERCH_EC', 'sandbox').length, 0);

    await assert.rejects(
      () =>
        startConnect({
          merchantUserId: 'MERCH_EC2',
          env: 'sandbox',
          provider: 'ecwid',
          adapterOpts: {},
          nonces,
          shops,
          nowMs: 1100,
        }),
      (e) => e && e.code === 'ecwid_app_credentials_missing',
    );
  });

  it('OAuth callback POST form token/{store_id} => pending_payment; bad state no row; store_id required', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH_EC',
      env: 'sandbox',
      provider: 'ecwid',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 2000,
    });

    let sawFormPost = false;
    const httpRequest = async (req) => {
      if (String(req.url).includes('/api/oauth/token/')) {
        sawFormPost = true;
        assert.equal(req.method, 'POST');
        assert.match(req.url, /\/api\/oauth\/token\/1003$/);
        assert.match(
          req.headers['content-type'],
          /application\/x-www-form-urlencoded/,
        );
        const body = String(req.body || '');
        assert.match(body, /grant_type=authorization_code/);
        assert.match(body, /client_id=ecwid_client_test/);
        assert.match(body, /client_secret=/);
        assert.ok(!String(req.url).includes('client_secret'));
        return {
          statusCode: 200,
          body: {
            access_token: 'secret_ACCESS_TOKEN',
            public_token: 'public_IGNORE_ME',
            scope: SCOPES,
            store_id: 1003,
            token_type: 'bearer',
          },
        };
      }
      if (String(req.url).includes('/profile')) {
        assert.equal(req.headers.Authorization, 'Bearer secret_ACCESS_TOKEN');
        return {
          statusCode: 200,
          body: {
            generalInfo: { storeUrl: 'https://demo.ecwid.com' },
            account: { accountName: 'Demo Ecwid' },
            formatsAndUnits: { currency: 'GBP' },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };

    const done = await completeConnect({
      provider: 'ecwid',
      state: started.state,
      req: { query: { code: 'auth_code_1', store_id: '1003' } },
      adapterOpts: {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        httpRequest,
        vault,
        callbackBaseUrl:
          'https://api.smartcatalogue.uk/merchant/shops/callback/ecwid',
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 3000,
    });
    assert.equal(sawFormPost, true);
    const shop = done.shop;
    assert.equal(shop.status, 'pending_payment');
    assert.equal(shop.provider, 'ecwid');
    assert.equal(shop.providerShopId, '1003');
    const full = shops.get(shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'oauth');
    assert.equal(creds.accessToken, 'secret_ACCESS_TOKEN');
    assert.equal(creds.accessTokenExpiresAt, null);
    assert.equal(creds.storeId, '1003');
    assert.ok(!JSON.stringify(creds).includes('public_IGNORE_ME'));
    assert.ok(!JSON.stringify(shop).includes('secret_ACCESS_TOKEN'));
    assert.ok(!JSON.stringify(shop).includes(CLIENT_SECRET));

    const started2 = await startConnect({
      merchantUserId: 'MERCH_EC2',
      env: 'sandbox',
      provider: 'ecwid',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 3500,
    });
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'ecwid',
          state: started2.state,
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
          nowMs: 3600,
        }),
      (e) => e && e.code === 'store_id_required',
    );

    await assert.rejects(
      () =>
        completeConnect({
          provider: 'ecwid',
          state: 'bogus-state',
          req: { query: { code: 'x', store_id: '1' } },
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
    assert.equal(shops.listByMerchant('MERCH_EC', 'sandbox').length, 1);
  });

  it('webhook signature pin: valid, bad, wrong secret', () => {
    const eventCreated = '1234567';
    const eventId = '80aece08-40e8-4145-8764-6c2f0d38678';
    const sig = signWebhookPayload(eventCreated, eventId, CLIENT_SECRET);
    const expect = crypto
      .createHmac('sha256', CLIENT_SECRET)
      .update(`${eventCreated}.${eventId}`, 'utf8')
      .digest('base64');
    assert.equal(sig, expect);
    assert.equal(
      verifyWebhookSignature(sig, { eventCreated, eventId }, CLIENT_SECRET),
      true,
    );
    assert.equal(
      verifyWebhookSignature('bad', { eventCreated, eventId }, CLIENT_SECRET),
      false,
    );
    assert.equal(
      verifyWebhookSignature(sig, { eventCreated, eventId }, 'other'),
      false,
    );
  });

  it('uninstall webhook suspends shop; invalid signature 401', async () => {
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const inserted = shops.insert({
      merchantUserId: 'M1',
      env: 'live',
      provider: 'ecwid',
      providerShopId: '1003',
      shopDomain: 'demo.ecwid.com',
      displayName: 'Demo',
      status: 'active',
      credentialsSecretRef: 'vault:ecwid:1003',
    });
    vault.put('vault:ecwid:1003', {
      accessToken: 'secret_x',
      storeId: '1003',
    });

    const eventCreated = 1234567;
    const eventId = 'evt-uninstall-1';
    const sig = signWebhookPayload(eventCreated, eventId, CLIENT_SECRET);
    let cancelled = false;
    const res = await handleEcwidWebhook(
      {
        rawPath: '/webhooks/shop/ecwid',
        requestContext: {
          http: { method: 'POST', path: '/webhooks/shop/ecwid' },
        },
        headers: { 'X-Ecwid-Webhook-Signature': sig },
        body: JSON.stringify({
          eventId,
          eventCreated,
          storeId: 1003,
          entityId: '1003',
          eventType: 'application.uninstalled',
        }),
      },
      {
        clientSecret: CLIENT_SECRET,
        shops,
        vault,
        cancelSubscription: async () => {
          cancelled = true;
          return { cancelled: true };
        },
      },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(shops.get(inserted.shopId).status, 'suspended');
    assert.equal(cancelled, true);

    const bad = await handleEcwidWebhook(
      {
        rawPath: '/webhooks/shop/ecwid',
        requestContext: {
          http: { method: 'POST', path: '/webhooks/shop/ecwid' },
        },
        headers: { 'X-Ecwid-Webhook-Signature': 'nope' },
        body: JSON.stringify({
          eventId,
          eventCreated,
          storeId: 1003,
          eventType: 'application.uninstalled',
        }),
      },
      { clientSecret: CLIENT_SECRET, shops, vault },
    );
    assert.equal(bad.statusCode, 401);
  });

  it('normalize fixture: absolute URLs + product id; skip disabled; no secrets', () => {
    const items = loadFixtureProducts();
    const rows = normalizeEcwidCatalog(
      { items },
      {
        env: 'sandbox',
        feedKey: 'shp_ec',
        shopDomain: 'demo.ecwid.com',
        currency: 'GBP',
      },
    );
    assert.equal(rows.length, 2);
    for (const r of rows) {
      assert.equal(r.Source, 'ecwid');
      assert.equal(r.FeedKey, 'shp_ec');
      assert.ok(r.MerchantProductId);
      assert.match(String(r.Url), /^https:\/\//);
      assert.ok(r.ContentHash);
      assert.ok(!JSON.stringify(r).includes('secret_'));
      assert.ok(!JSON.stringify(r).includes('access_token'));
    }
    const mug = rows.find((r) => r.MerchantProductId === '1001');
    assert.ok(mug);
    assert.equal(mug.Price, 12.5);
    const hat = rows.find((r) => r.MerchantProductId === '1002');
    assert.ok(hat);
    assert.equal(hat.Price, 18);
  });

  it('catalog pagination + 401 unauthorized', async () => {
    let pages = 0;
    const httpRequest = async (req) => {
      pages += 1;
      assert.match(req.url, /enabled=true/);
      assert.match(req.headers.Authorization, /^Bearer /);
      if (pages === 1) {
        return {
          statusCode: 200,
          body: {
            items: [{ id: 1, name: 'A', enabled: true, price: 1 }],
            total: 2,
            count: 1,
            offset: 0,
            limit: 1,
          },
        };
      }
      return {
        statusCode: 200,
        body: {
          items: [{ id: 2, name: 'B', enabled: true, price: 2 }],
          total: 2,
          count: 1,
          offset: 1,
          limit: 1,
        },
      };
    };
    const all = await fetchAllProducts({
      storeId: '1003',
      accessToken: 'secret_tok',
      httpRequest,
      limit: 1,
    });
    assert.equal(all.products.length, 2);

    await assert.rejects(
      () =>
        fetchProductsPage({
          storeId: '1003',
          accessToken: 'bad',
          httpRequest: async () => ({ statusCode: 401, body: {} }),
        }),
      (e) => e && e.code === 'ecwid_unauthorized',
    );
  });
});
