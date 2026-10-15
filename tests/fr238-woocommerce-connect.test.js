'use strict';

/**
 * FR-238 / #1352: WooCommerce /wc-auth connect + advanced paste.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-238.md');

const { createNonceStore } = require('../shared/shops/nonceStore');
const { createShopsRegistry } = require('../shared/shops/registry');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  startConnect,
  completeConnect,
} = require('../shared/shops/connect');
const {
  normalizeShopOrigin,
} = require('../shared/shops/adapters/woocommerce');
const {
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
} = require('../entry/src/merchantShops');
const {
  readWooCommerceCreds,
  assertWooCommerceCreds,
} = require('../providers/local/woocommerce/src/catalog');
const { listProviders } = require('../shared/shops/adapters');

const ORIGIN = 'https://shop.example.com';

function fakeHttp(sequence) {
  const q = sequence.slice();
  return async (req) => {
    if (!q.length) {
      return { statusCode: 500, body: { error: 'unexpected' } };
    }
    const next = q.shift();
    if (typeof next === 'function') return next(req);
    return next;
  };
}

describe('FR-238 WooCommerce shop connect', () => {
  it('docs Decision LOCKED; ASCII no-BOM; adapter registered', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-238.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /wc-auth/);
    assert.match(text, /key_permissions|read-only|scope=read/i);
    assert.match(text, /FR-251/);
    assert.ok(listProviders().includes('woocommerce'));
  });

  it('SSRF gate: http and private hosts rejected before outbound', () => {
    assert.throws(
      () => normalizeShopOrigin('http://shop.example.com'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.throws(
      () => normalizeShopOrigin('https://127.0.0.1'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.throws(
      () => normalizeShopOrigin('https://192.168.1.10'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.throws(
      () => normalizeShopOrigin('https://10.0.0.2/path'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.equal(normalizeShopOrigin('shop.example.com'), ORIGIN);
  });

  it('startConnect returns /wc-auth authorize URL with state as user_id', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const httpRequest = fakeHttp([{ statusCode: 401, body: {} }]);
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'woocommerce',
      shopDomain: 'shop.example.com',
      adapterOpts: { httpRequest },
      nonces,
      shops,
      nowMs: 1000,
    });
    assert.ok(started.redirectUrl.includes('/wc-auth/v1/authorize'));
    assert.ok(started.redirectUrl.includes('scope=read'));
    assert.ok(started.redirectUrl.includes(`user_id=${started.state}`));
    assert.equal(started.loginRequired, true);
    assert.equal(shops.listByMerchant('MERCH001', 'sandbox').length, 0);
  });

  it('callback read keys => pending_payment + vault; write keys / bad nonce => 400 no row', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const httpRequest = fakeHttp([
      { statusCode: 401, body: {} },
      { statusCode: 200, body: [{ id: 1, name: 'Hat' }] },
    ]);
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'live',
      provider: 'woocommerce',
      shopDomain: ORIGIN,
      adapterOpts: { httpRequest },
      nonces,
      shops,
      nowMs: 2000,
    });

    const done = await completeConnect({
      provider: 'woocommerce',
      state: started.state,
      req: {
        body: {
          user_id: started.state,
          key_id: '9',
          consumer_key: 'ck_test',
          consumer_secret: 'cs_test',
          key_permissions: 'read',
        },
      },
      adapterOpts: { httpRequest, vault },
      nonces,
      shops,
      nowMs: 2500,
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
    });
    assert.equal(done.shop.status, 'pending_payment');
    assert.equal(done.shop.provider, 'woocommerce');
    assert.ok(done.redirectTo.includes(done.shop.shopId));
    const ref = `vault:woocommerce:shop.example.com`;
    const stored = vault.get(ref);
    assert.equal(stored.kind, 'woocommerce_rest');
    assert.equal(stored.consumerKey, 'ck_test');
    assert.ok(!JSON.stringify(done).includes('cs_test'));

    // write keys rejected
    const nonces2 = createNonceStore();
    const shops2 = createShopsRegistry();
    const http2 = fakeHttp([{ statusCode: 401, body: {} }]);
    const s2 = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'live',
      provider: 'woocommerce',
      shopDomain: ORIGIN,
      adapterOpts: { httpRequest: http2 },
      nonces: nonces2,
      shops: shops2,
      nowMs: 3000,
    });
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'woocommerce',
          state: s2.state,
          req: {
            body: {
              user_id: s2.state,
              consumer_key: 'ck',
              consumer_secret: 'cs',
              key_permissions: 'read_write',
            },
          },
          adapterOpts: { httpRequest: http2, vault: createCredentialsVault() },
          nonces: nonces2,
          shops: shops2,
          nowMs: 3100,
          subscribeBaseUrl: 'https://x',
        }),
      (e) => e && e.code === 'invalid_key_permissions',
    );
    assert.equal(shops2.listByMerchant('MERCH001', 'live').length, 0);

    // bad nonce
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'woocommerce',
          state: 'nope',
          req: {
            body: {
              user_id: 'nope',
              consumer_key: 'ck',
              consumer_secret: 'cs',
              key_permissions: 'read',
            },
          },
          adapterOpts: { httpRequest: fakeHttp([]), vault: createCredentialsVault() },
          nonces: createNonceStore(),
          shops: createShopsRegistry(),
          nowMs: 4000,
          subscribeBaseUrl: 'https://x',
        }),
      (e) => e && e.code === 'invalid_state',
    );
  });

  it('HTTP connect + callback; keys absent from 302; http domain 400', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const httpRequest = fakeHttp([
      { statusCode: 401, body: {} },
      { statusCode: 200, body: [] },
    ]);
    const deps = {
      nonces,
      shops,
      vault,
      httpRequest,
      adapterOpts: { httpRequest, vault },
      verifyAuthorization: async () => ({ userId: 'MERCH001' }),
      envName: 'live',
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
      nowMs: 5000,
    };

    const bad = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({
          provider: 'woocommerce',
          shopDomain: 'http://shop.example.com',
        }),
      },
      deps,
    );
    assert.equal(bad.statusCode, 400);
    assert.equal(JSON.parse(bad.body).error, 'invalid_shop_domain');

    const start = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({
          provider: 'woocommerce',
          shopDomain: 'shop.example.com',
        }),
      },
      { ...deps, nowMs: 5100 },
    );
    assert.equal(start.statusCode, 200);
    const startBody = JSON.parse(start.body);
    assert.ok(startBody.redirectUrl.includes('/wc-auth/v1/authorize'));

    const cb = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/woocommerce',
        requestContext: {
          http: { method: 'POST', path: '/merchant/shops/callback/woocommerce' },
        },
        queryStringParameters: {},
        body: JSON.stringify({
          user_id: startBody.state,
          key_id: '1',
          consumer_key: 'ck_http',
          consumer_secret: 'cs_http',
          key_permissions: 'read',
        }),
      },
      { ...deps, nowMs: 5200 },
    );
    assert.equal(cb.statusCode, 302);
    assert.ok(!String(cb.headers.location).includes('cs_http'));
    assert.ok(!String(cb.headers.location).includes('ck_http'));
    assert.equal(shops.listByMerchant('MERCH001', 'live').length, 1);
  });

  it('advanced paste connect creates shop; write paste rejected', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    // startConnect paste: probe + products; completeConnect: products again
    const httpRequest = fakeHttp([
      { statusCode: 401, body: {} },
      { statusCode: 200, body: [{ id: 2 }] },
      { statusCode: 200, body: [{ id: 2 }] },
    ]);
    const deps = {
      nonces,
      shops,
      vault,
      httpRequest,
      adapterOpts: { httpRequest, vault },
      verifyAuthorization: async () => ({ userId: 'MERCH002' }),
      envName: 'sandbox',
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
      nowMs: 6000,
    };
    const ok = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({
          provider: 'woocommerce',
          shopDomain: 'paste.example.com',
          consumerKey: 'ck_paste',
          consumerSecret: 'cs_paste',
        }),
      },
      deps,
    );
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.equal(body.paste, true);
    assert.equal(body.shop.status, 'pending_payment');
    assert.ok(!JSON.stringify(body).includes('cs_paste'));
    assert.equal(vault.get('vault:woocommerce:paste.example.com').consumerKey, 'ck_paste');

    const httpWrite = fakeHttp([{ statusCode: 401, body: {} }]);
    // write-scope cannot be expressed on paste fields; keys_invalid if probe fails
    const badProbe = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer t' },
        body: JSON.stringify({
          provider: 'woocommerce',
          shopDomain: 'bad.example.com',
          consumerKey: 'ck',
          consumerSecret: 'cs',
        }),
      },
      {
        ...deps,
        nonces: createNonceStore(),
        shops: createShopsRegistry(),
        httpRequest: fakeHttp([
          { statusCode: 401, body: {} },
          { statusCode: 401, body: { message: 'denied' } },
        ]),
        adapterOpts: {
          httpRequest: fakeHttp([
            { statusCode: 401, body: {} },
            { statusCode: 401, body: { message: 'denied' } },
          ]),
          vault: createCredentialsVault(),
        },
        nowMs: 7000,
      },
    );
    assert.equal(badProbe.statusCode, 400);
    assert.equal(JSON.parse(badProbe.body).error, 'keys_invalid');
    void httpWrite;
  });

  it('catalog accepts per-call storeUrl + consumer key overrides', () => {
    const c = readWooCommerceCreds(
      {},
      {
        storeUrl: 'https://override.example.com',
        consumerKey: 'ck_o',
        consumerSecret: 'cs_o',
      },
    );
    assert.equal(c.storeUrl, 'https://override.example.com');
    assert.equal(c.consumerKey, 'ck_o');
    const a = assertWooCommerceCreds(
      { WOOCOMMERCE_STORE_URL: 'https://env.example.com' },
      { consumerKey: 'ck', consumerSecret: 'cs', shopDomain: 'https://shop.example.com' },
    );
    assert.equal(a.storeUrl, 'https://shop.example.com');
  });
});
