'use strict';

/**
 * FR-216 / #1221: Merchant shop connect via platform session (orchestration).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-216.md');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const MIGRATION = path.join(ROOT, 'db', 'migrations', '010_Shops.sql');

const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
  getAdapter,
} = require('../shared/shops/connect');
const {
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
  matchMerchantShopsRoute,
} = require('../entry/src/merchantShops');

describe('FR-216 merchant shops connect', () => {
  it('docs/fr/FR-216.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-216.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /\/merchant\/shops\/connect/);
    assert.match(text, /\/merchant\/shops\/callback/);
    assert.match(text, /pending_payment/);
    assert.match(text, /a_search/);
    assert.match(text, /FR-235|Shops registry/i);
  });

  it('fixture session returns shop id/domain; absent session => login challenge', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const env = 'sandbox';
    const merchantUserId = 'abcd1234';

    const loggedOut = await startConnect({
      merchantUserId,
      env,
      provider: 'fixture',
      shopDomain: 'demo.example',
      adapterOpts: { session: { loggedIn: false } },
      nonces,
      shops,
      nowMs: 1_000,
    });
    assert.equal(loggedOut.loginRequired, true);
    assert.ok(loggedOut.redirectUrl, 'must prompt login, not silent empty');
    assert.ok(loggedOut.state);
    assert.equal(shops.listByMerchant(merchantUserId, env).length, 0);

    const loggedIn = await startConnect({
      merchantUserId,
      env,
      provider: 'fixture',
      shopDomain: 'demo.example',
      adapterOpts: {
        session: {
          loggedIn: true,
          providerShopId: 'shop_1',
          shopDomain: 'demo.example',
          displayName: 'Demo Shop',
        },
      },
      nonces,
      shops,
      nowMs: 2_000,
    });
    assert.equal(loggedIn.loginRequired, false);
    assert.ok(loggedIn.redirectUrl);
    assert.ok(loggedIn.state);

    const done = await completeConnect({
      provider: 'fixture',
      state: loggedIn.state,
      req: {
        query: { code: 'fixture_ok' },
        body: {},
      },
      adapterOpts: {
        session: {
          loggedIn: true,
          providerShopId: 'shop_1',
          shopDomain: 'demo.example',
          displayName: 'Demo Shop',
        },
      },
      nonces,
      shops,
      nowMs: 3_000,
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
    });
    assert.equal(done.shop.providerShopId, 'shop_1');
    assert.equal(done.shop.shopDomain, 'demo.example');
    assert.equal(done.shop.status, 'pending_payment');
    assert.ok(!('credentials' in done.shop), 'credentials never returned');
    assert.match(done.redirectTo, /subscribe/);
  });

  it('two shops same provider => two Shop rows; nonce bound + expiry', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const merchantUserId = 'abcd1234';
    const env = 'live';

    async function connectOne(providerShopId, shopDomain, t0) {
      const start = await startConnect({
        merchantUserId,
        env,
        provider: 'fixture',
        shopDomain,
        adapterOpts: {
          session: {
            loggedIn: true,
            providerShopId,
            shopDomain,
            displayName: shopDomain,
          },
        },
        nonces,
        shops,
        nowMs: t0,
      });
      return completeConnect({
        provider: 'fixture',
        state: start.state,
        req: { query: { code: 'ok' }, body: {} },
        adapterOpts: {
          session: {
            loggedIn: true,
            providerShopId,
            shopDomain,
            displayName: shopDomain,
          },
        },
        nonces,
        shops,
        nowMs: t0 + 1,
        subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
      });
    }

    await connectOne('s1', 'a.myshopify.com', 10_000);
    await connectOne('s2', 'b.myshopify.com', 20_000);
    const rows = shops.listByMerchant(merchantUserId, env);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].provider, 'fixture');
    assert.equal(rows[1].provider, 'fixture');
    assert.notEqual(rows[0].shopId, rows[1].shopId);

    const expired = await startConnect({
      merchantUserId,
      env,
      provider: 'fixture',
      shopDomain: 'c.myshopify.com',
      adapterOpts: { session: { loggedIn: true, providerShopId: 's3', shopDomain: 'c.myshopify.com' } },
      nonces,
      shops,
      nowMs: 30_000,
    });
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'fixture',
          state: expired.state,
          req: { query: {}, body: {} },
          adapterOpts: { session: { loggedIn: true, providerShopId: 's3', shopDomain: 'c.myshopify.com' } },
          nonces,
          shops,
          nowMs: 30_000 + 11 * 60 * 1000,
          subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
        }),
      /nonce_expired|invalid_state/,
    );
  });

  it('adapter contract + unknown provider; getAdapter fixture', () => {
    const a = getAdapter('fixture');
    assert.equal(typeof a.startConnect, 'function');
    assert.equal(typeof a.completeConnect, 'function');
    assert.equal(typeof a.verifyWebhook, 'function');
    assert.equal(typeof a.revoke, 'function');
    assert.throws(() => getAdapter('nope'), /unknown_provider/);
  });

  it('HTTP handlers: JWT connect + callback; no silent empty; no credentials in body', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const deps = {
      nonces,
      shops,
      verifyAuthorization: async () => ({ userId: 'merch001' }),
      envName: 'sandbox',
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
    };

    assert.equal(
      matchMerchantShopsRoute('POST', '/merchant/shops/connect'),
      'POST /merchant/shops/connect',
    );
    assert.equal(
      matchMerchantShopsRoute('GET', '/merchant/shops/callback/fixture'),
      'GET|POST /merchant/shops/callback/{provider}',
    );

    const challenge = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({
          provider: 'fixture',
          shopDomain: 'x.example',
          session: { loggedIn: false },
        }),
      },
      deps,
    );
    assert.equal(challenge.statusCode, 200);
    const challengeBody = JSON.parse(challenge.body);
    assert.equal(challengeBody.loginRequired, true);
    assert.ok(challengeBody.redirectUrl);

    const start = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({
          provider: 'fixture',
          shopDomain: 'y.example',
          session: {
            loggedIn: true,
            providerShopId: 'p9',
            shopDomain: 'y.example',
            displayName: 'Y',
          },
        }),
      },
      deps,
    );
    assert.equal(start.statusCode, 200);
    const startBody = JSON.parse(start.body);
    assert.equal(startBody.loginRequired, false);

    const cb = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/fixture',
        queryStringParameters: { state: startBody.state, code: 'ok' },
        body: '',
      },
      {
        ...deps,
        adapterOptsFromReq: () => ({
          session: {
            loggedIn: true,
            providerShopId: 'p9',
            shopDomain: 'y.example',
            displayName: 'Y',
          },
        }),
      },
    );
    assert.equal(cb.statusCode, 302);
    assert.match(cb.headers.location, /subscribe/);
    assert.ok(!String(cb.body || '').includes('access_token'));
    assert.equal(shops.listByMerchant('merch001', 'sandbox').length, 1);
  });

  it('migration 010_Shops.sql targets a_search; stack pins connect+callback routes', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /CREATE TABLE/i);
    assert.match(sql, /Shops/i);
    assert.match(sql, /providerShopId|ProviderShopId/i);
    assert.match(sql, /pending_payment/);
    assert.match(sql, /a_search/);
    assert.doesNotMatch(sql, /USE\s+madeiradb/i);

    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/merchant\/shops\/connect'/);
    assert.match(stack, /path:\s*'\/merchant\/shops\/callback\/\{provider\}'/);
  });
});
