'use strict';

/**
 * FR-236 / #1350: Shopify OAuth offline token connect + webhooks.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
  getAdapter,
} = require('../shared/shops/connect');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  verifyShopifyHmac,
  assertMyshopifyDomain,
  MYSHOPIFY_RE,
} = require('../shared/shops/adapters/shopify');
const {
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
} = require('../entry/src/merchantShops');
const {
  matchShopifyWebhookRoute,
  handleShopifyWebhook,
} = require('../entry/src/shopifyWebhooks');
const {
  readShopifyCreds,
  assertShopifyCreds,
} = require('../providers/local/shopify/src/catalog');

const SECRET = 'shpss_test_secret';
const CLIENT_ID = 'client_test_id';

function signQuery(query, secret) {
  const q = { ...query };
  delete q.hmac;
  delete q.signature;
  const message = Object.keys(q)
    .sort()
    .map((k) => `${k}=${q[k]}`)
    .join('&');
  const hmac = crypto.createHmac('sha256', secret).update(message).digest('hex');
  return { ...q, hmac };
}

function signWebhookBody(raw, secret) {
  return crypto.createHmac('sha256', secret).update(raw).digest('base64');
}

describe('FR-236 shopify connect', () => {
  it('Decision LOCKED docs + adapter registered + CDK webhook route', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-236.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /offline/i);
    assert.match(fr, /\/webhooks\/shop\/shopify/);
    assert.equal(getAdapter('shopify'), require('../shared/shops/adapters/shopify'));
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/webhooks\/shop\/shopify'/);
    assert.equal(MYSHOPIFY_RE.test('demo.myshopify.com'), true);
  });

  it('startConnect builds authorize URL; rejects bad domain', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    await assert.rejects(
      () =>
        startConnect({
          merchantUserId: 'MERCH001',
          env: 'sandbox',
          provider: 'shopify',
          shopDomain: 'evil.example.com',
          adapterOpts: { clientId: CLIENT_ID },
          nonces,
          shops,
          nowMs: 1000,
        }),
      (err) => err && err.code === 'invalid_shop_domain',
    );
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'shopify',
      shopDomain: 'demo-shop.myshopify.com',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      callbackBaseUrl:
        'https://api.example/merchant/shops/callback/shopify',
      nowMs: 2000,
    });
    assert.match(
      started.redirectUrl,
      /^https:\/\/demo-shop\.myshopify\.com\/admin\/oauth\/authorize\?/,
    );
    assert.match(started.redirectUrl, /client_id=client_test_id/);
    assert.match(started.redirectUrl, /read_products/);
    assert.match(started.redirectUrl, /state=/);
    assert.equal(shops.listByMerchant('MERCH001', 'sandbox').length, 0);
  });

  it('fixture callback valid hmac/state => pending_payment + vault; bad hmac no row', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'shopify',
      shopDomain: 'demo-shop.myshopify.com',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 3000,
    });

    let sawTokenInHttp = false;
    const httpRequest = async (req) => {
      if (String(req.url).includes('/admin/oauth/access_token')) {
        return {
          statusCode: 200,
          body: {
            access_token: 'shpat_OFFLINE_TOKEN',
            scope: 'read_products,read_inventory',
          },
        };
      }
      if (String(req.url).includes('/shop.json')) {
        return {
          statusCode: 200,
          body: { shop: { name: 'Demo Shop', currency: 'GBP' } },
        };
      }
      return { statusCode: 404, body: {} };
    };

    const goodQuery = signQuery(
      {
        code: 'auth_code',
        shop: 'demo-shop.myshopify.com',
        state: started.state,
        timestamp: '1710000000',
      },
      SECRET,
    );
    assert.equal(verifyShopifyHmac(goodQuery, SECRET), true);

    const done = await completeConnect({
      provider: 'shopify',
      state: started.state,
      req: { query: goodQuery },
      adapterOpts: {
        clientId: CLIENT_ID,
        clientSecret: SECRET,
        httpRequest,
        vault,
      },
      nonces,
      shops,
      nowMs: 4000,
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
    });
    assert.equal(done.shop.status, 'pending_payment');
    assert.equal(done.shop.shopDomain, 'demo-shop.myshopify.com');
    assert.ok(done.shop.credentialsSecretRef == null); // public shop view has no secret
    assert.match(done.redirectTo, /shopId=shp_/);
    assert.ok(!JSON.stringify(done).includes('shpat_OFFLINE_TOKEN'));
    assert.ok(!done.redirectTo.includes('shpat_'));
    const stored = vault.get(`vault:shopify:demo-shop.myshopify.com`);
    assert.equal(stored.accessToken, 'shpat_OFFLINE_TOKEN');
    assert.equal(stored.kind, 'shopify_offline');
    void sawTokenInHttp;

    // Bad hmac: fresh connect then tampered query
    const started2 = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'shopify',
      shopDomain: 'other-shop.myshopify.com',
      adapterOpts: { clientId: CLIENT_ID },
      nonces,
      shops,
      nowMs: 5000,
    });
    const before = shops.listByMerchant('MERCH001', 'sandbox').length;
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'shopify',
          state: started2.state,
          req: {
            query: {
              code: 'x',
              shop: 'other-shop.myshopify.com',
              state: started2.state,
              hmac: 'deadbeef',
            },
          },
          adapterOpts: {
            clientId: CLIENT_ID,
            clientSecret: SECRET,
            httpRequest,
            vault,
          },
          nonces,
          shops,
          nowMs: 6000,
          subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
        }),
      (err) => err && err.code === 'invalid_hmac',
    );
    assert.equal(shops.listByMerchant('MERCH001', 'sandbox').length, before);
  });

  it('HTTP connect + callback; token absent from 302 location', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const deps = {
      verifyAuthorization: async () => ({ userId: 'MERCH001' }),
      nonces,
      shops,
      adapterOpts: { clientId: CLIENT_ID, clientSecret: SECRET, vault },
      callbackBaseUrl:
        'https://api.example/merchant/shops/callback/shopify',
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
      nowMs: 7000,
    };
    const start = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({
          provider: 'shopify',
          shopDomain: 'http-shop.myshopify.com',
        }),
      },
      deps,
    );
    assert.equal(start.statusCode, 200);
    const startBody = JSON.parse(start.body);
    const state = startBody.state;

    const httpRequest = async (req) => {
      if (String(req.url).includes('access_token')) {
        return {
          statusCode: 200,
          body: { access_token: 'shpat_HTTP', scope: 'read_products' },
        };
      }
      return { statusCode: 200, body: { shop: { name: 'HTTP' } } };
    };
    deps.adapterOpts = {
      clientId: CLIENT_ID,
      clientSecret: SECRET,
      vault,
      httpRequest,
    };
    const q = signQuery(
      {
        code: 'c',
        shop: 'http-shop.myshopify.com',
        state,
        timestamp: '1',
      },
      SECRET,
    );
    const cb = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/shopify',
        requestContext: {
          http: { method: 'GET', path: '/merchant/shops/callback/shopify' },
        },
        queryStringParameters: q,
        body: '',
      },
      deps,
    );
    assert.equal(cb.statusCode, 302);
    assert.ok(!String(cb.headers.location).includes('shpat_'));
    assert.equal(shops.listByMerchant('MERCH001', 'live').length, 1);
  });

  it('app/uninstalled => suspended; shop/redact deletes; privacy 200', async () => {
    assert.equal(
      matchShopifyWebhookRoute('POST', '/webhooks/shop/shopify'),
      'POST /webhooks/shop/shopify',
    );
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const row = shops.insert({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'shopify',
      providerShopId: 'gone.myshopify.com',
      shopDomain: 'gone.myshopify.com',
      credentialsSecretRef: 'vault:shopify:gone.myshopify.com',
    });
    vault.put(row.credentialsSecretRef, { accessToken: 'x' });
    let cancelCalls = 0;

    const rawUninstall = Buffer.from(
      JSON.stringify({ domain: 'gone.myshopify.com' }),
      'utf8',
    );
    const un = await handleShopifyWebhook(
      {
        headers: {
          'x-shopify-hmac-sha256': signWebhookBody(rawUninstall, SECRET),
          'x-shopify-topic': 'app/uninstalled',
          'x-shopify-shop-domain': 'gone.myshopify.com',
        },
        body: rawUninstall.toString('utf8'),
      },
      {
        clientSecret: SECRET,
        shops,
        vault,
        cancelSubscription: async () => {
          cancelCalls += 1;
          return { cancelled: true };
        },
      },
    );
    assert.equal(un.statusCode, 200);
    assert.equal(shops.getByShopId(row.shopId).status, 'suspended');
    assert.equal(shops.getByShopId(row.shopId).statusReason, 'uninstalled');
    assert.equal(cancelCalls, 1);

    const rawPriv = Buffer.from('{}', 'utf8');
    const priv = await handleShopifyWebhook(
      {
        headers: {
          'x-shopify-hmac-sha256': signWebhookBody(rawPriv, SECRET),
          'x-shopify-topic': 'customers/redact',
          'x-shopify-shop-domain': 'gone.myshopify.com',
        },
        body: '{}',
      },
      { clientSecret: SECRET, shops, vault },
    );
    assert.equal(priv.statusCode, 200);

    const rawRedact = Buffer.from('{}', 'utf8');
    const red = await handleShopifyWebhook(
      {
        headers: {
          'x-shopify-hmac-sha256': signWebhookBody(rawRedact, SECRET),
          'x-shopify-topic': 'shop/redact',
          'x-shopify-shop-domain': 'gone.myshopify.com',
        },
        body: '{}',
      },
      { clientSecret: SECRET, shops, vault },
    );
    assert.equal(red.statusCode, 200);
    assert.equal(shops.getByShopId(row.shopId), null);
    assert.equal(vault.get(row.credentialsSecretRef), null);
  });

  it('catalog accepts per-call shopDomain+accessToken overrides', () => {
    const c = assertShopifyCreds(
      {},
      { shopDomain: 'x.myshopify.com', accessToken: 'tok' },
    );
    assert.equal(c.storeUrl, 'x.myshopify.com');
    assert.equal(c.accessToken, 'tok');
    const envOnly = readShopifyCreds({
      SHOPIFY_STORE_URL: 'env.myshopify.com',
      SHOPIFY_ACCESS_TOKEN: 'envtok',
    });
    assert.equal(envOnly.storeUrl, 'env.myshopify.com');
  });

  it('assertMyshopifyDomain helper', () => {
    assert.equal(assertMyshopifyDomain('Ab-C.myshopify.com'), 'ab-c.myshopify.com');
    assert.throws(() => assertMyshopifyDomain('nope.com'), (e) => e.code === 'invalid_shop_domain');
  });
});
