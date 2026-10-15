'use strict';

/**
 * FR-243 / #1357: Magento Integration OAuth 1.0a connect + catalog normalize.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-243.md');

const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
  getAdapter,
} = require('../shared/shops/connect');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  normalizeShopOrigin,
  receiveActivation,
  clearPendingActivations,
} = require('../shared/shops/adapters/magento');
const {
  signOAuth1,
  pctEncode,
  normalizeParams,
} = require('../providers/local/magento/src/oauth1');
const {
  normalizeMagentoCatalog,
  loadFixtureProducts,
} = require('../providers/local/magento/src/normalize');
const {
  matchMerchantShopsRoute,
  handleMerchantShopsCallback,
} = require('../entry/src/merchantShops');

describe('FR-243 magento connect', () => {
  it('Decision LOCKED docs ASCII + adapter + registry + CDK identity route', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-243.md must be ASCII');
    const fr = buf.toString('utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /HMAC-SHA256/i);
    assert.match(fr, /parent with min price/i);
    assert.match(fr, /FR-251|a_search/);
    assert.equal(
      getAdapter('magento'),
      require('../shared/shops/adapters/magento'),
    );
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const sources = reg.sources || [];
    const row = sources.find((p) => p.id === 'magento');
    assert.ok(row);
    assert.equal(row.kind, 'local');
    assert.equal(row.class, 'merchant');
    assert.equal(row.enabled.live, false);
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/merchant\/shops\/magento\/identity'/);
    assert.equal(
      matchMerchantShopsRoute('GET', '/merchant/shops/magento/identity'),
      'GET|POST /merchant/shops/magento/identity',
    );
  });

  it('OAuth 1.0a HMAC-SHA256 signature pin against known vector', () => {
    const signed = signOAuth1({
      method: 'GET',
      url: 'https://shop.example.com/rest/V1/products',
      consumerKey: 'ck',
      consumerSecret: 'cs',
      token: 'atk',
      tokenSecret: 'ats',
      nonce: 'nonce123',
      timestamp: 1700000000,
    });
    assert.equal(signed.oauthParams.oauth_signature_method, 'HMAC-SHA256');
    const expectedBase = [
      'GET',
      pctEncode('https://shop.example.com/rest/V1/products'),
      pctEncode(
        normalizeParams({
          oauth_consumer_key: 'ck',
          oauth_nonce: 'nonce123',
          oauth_signature_method: 'HMAC-SHA256',
          oauth_timestamp: '1700000000',
          oauth_token: 'atk',
          oauth_version: '1.0',
        }),
      ),
    ].join('&');
    assert.equal(signed.signatureBaseString, expectedBase);
    const key = `${pctEncode('cs')}&${pctEncode('ats')}`;
    const expectSig = crypto
      .createHmac('sha256', key)
      .update(expectedBase)
      .digest('base64');
    assert.equal(signed.signature, expectSig);
    assert.match(signed.authorization, /^OAuth /);
  });

  it('SSRF: http and private IP store_base_url rejected with no outbound', async () => {
    clearPendingActivations();
    assert.throws(
      () => normalizeShopOrigin('http://shop.example.com'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.throws(
      () => normalizeShopOrigin('https://127.0.0.1/magento'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.throws(
      () => normalizeShopOrigin('https://192.168.1.9/'),
      (e) => e && e.code === 'invalid_shop_domain',
    );
    let calls = 0;
    const httpRequest = async () => {
      calls += 1;
      return { statusCode: 200, body: {} };
    };
    await assert.rejects(
      async () => {
        receiveActivation({
          store_base_url: 'https://10.0.0.5/',
          oauth_verifier: 'v',
          oauth_consumer_key: 'ck',
          oauth_consumer_secret: 'cs',
        });
      },
      (e) => e && e.code === 'invalid_shop_domain',
    );
    assert.equal(calls, 0);
  });

  it('activation POST + identity bind + token exchange => pending_payment vault', async () => {
    clearPendingActivations();
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH_M',
      env: 'sandbox',
      provider: 'magento',
      nonces,
      shops,
      callbackBaseUrl:
        'https://api.example/merchant/shops/callback/magento',
      adapterOpts: {
        identityBaseUrl: 'https://smartcatalogue.uk/merchant/shops/magento/identity',
      },
      nowMs: 1000,
    });
    assert.match(started.redirectUrl, /magento\/identity\?state=/);
    assert.match(started.callbackUrl, /callback\/magento/);
    assert.ok(started.instructions);

    const held = receiveActivation(
      {
        store_base_url: 'https://demo.magento.test/',
        oauth_verifier: 'verifier1',
        oauth_consumer_key: 'ck_demo',
        oauth_consumer_secret: 'cs_demo',
      },
      { nowMs: 2000 },
    );
    assert.equal(held.ok, true);
    assert.equal(held.storeBaseUrl, 'https://demo.magento.test');

    // Entry activation path (no state)
    const actRes = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/magento',
        requestContext: { http: { method: 'POST', path: '/merchant/shops/callback/magento' } },
        body: JSON.stringify({
          store_base_url: 'https://other.magento.test/',
          oauth_verifier: 'v2',
          oauth_consumer_key: 'ck_other',
          oauth_consumer_secret: 'cs_other',
        }),
      },
      { nowMs: 2500 },
    );
    assert.equal(actRes.statusCode, 200);

    let sawRequest = false;
    let sawAccess = false;
    const httpRequest = async (req) => {
      const u = String(req.url);
      assert.match(req.headers.Authorization, /^OAuth /);
      if (u.includes('/oauth/token/request')) {
        sawRequest = true;
        return {
          statusCode: 200,
          body: 'oauth_token=rtok&oauth_token_secret=rsec',
        };
      }
      if (u.includes('/oauth/token/access')) {
        sawAccess = true;
        return {
          statusCode: 200,
          body: 'oauth_token=atok&oauth_token_secret=asec',
        };
      }
      if (u.includes('/rest/V1/store/storeConfigs')) {
        return {
          statusCode: 200,
          body: [
            {
              base_url: 'https://demo.magento.test/',
              base_currency_code: 'GBP',
              locale: 'en_GB',
            },
          ],
        };
      }
      return { statusCode: 404, body: {} };
    };

    const done = await completeConnect({
      provider: 'magento',
      state: started.state,
      req: {
        query: {
          oauth_consumer_key: 'ck_demo',
          success_call_back: 'https://demo.magento.test/admin/oauth_success',
        },
      },
      adapterOpts: { httpRequest, vault },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 3000,
    });
    assert.equal(sawRequest && sawAccess, true);
    assert.equal(done.shop.status, 'pending_payment');
    assert.equal(done.shop.provider, 'magento');
    const full = shops.get(done.shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'oauth1');
    assert.equal(creds.consumerKey, 'ck_demo');
    assert.equal(creds.accessToken, 'atok');
    assert.equal(creds.accessTokenSecret, 'asec');
    assert.ok(!JSON.stringify(done.shop).includes('cs_demo'));
    assert.ok(!JSON.stringify(done.shop).includes('asec'));

    // Unknown consumer key
    const started2 = await startConnect({
      merchantUserId: 'MERCH_M2',
      env: 'sandbox',
      provider: 'magento',
      nonces,
      shops,
      nowMs: 4000,
    });
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'magento',
          state: started2.state,
          req: { query: { oauth_consumer_key: 'missing' } },
          adapterOpts: { httpRequest, vault },
          nonces,
          shops,
          subscribeBaseUrl: 'https://example/subscribe',
          nowMs: 5000,
        }),
      (e) => e && e.code === 'unknown_consumer_key',
    );
  });

  it('normalize fixture: absolute URLs + SKU MerchantProductId; no secrets', () => {
    const items = loadFixtureProducts();
    const rows = normalizeMagentoCatalog(
      { items },
      {
        env: 'sandbox',
        feedKey: 'shp_m',
        storeBaseUrl: 'https://demo.magento.test',
        currency: 'GBP',
      },
    );
    assert.ok(rows.length >= 2);
    for (const r of rows) {
      assert.equal(r.Source, 'magento');
      assert.equal(r.FeedKey, 'shp_m');
      assert.ok(r.MerchantProductId);
      assert.match(String(r.Url), /^https:\/\/demo\.magento\.test\//);
      assert.ok(r.ContentHash);
      assert.ok(!JSON.stringify(r).includes('oauth'));
      assert.ok(!JSON.stringify(r).includes('secret'));
    }
    const mug = rows.find((r) => r.MerchantProductId === 'MUG-MAD-01');
    assert.ok(mug);
    assert.equal(mug.Price, 12.5);
  });
});
