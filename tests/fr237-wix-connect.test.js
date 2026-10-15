'use strict';

/**
 * FR-237 / #1351: Wix app-install instanceId connect + token mint + App Removed.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-237.md');
const SKILL = path.join(
  ROOT,
  'providers',
  'local',
  'wix',
  '.grok',
  'skills',
  'a-search-wix',
  'SKILL.md',
);
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');

const {
  createNonceStore,
} = require('../shared/shops/nonceStore');
const {
  createShopsRegistry,
} = require('../shared/shops/registry');
const {
  createCredentialsVault,
} = require('../shared/shops/vault');
const {
  startConnect,
  completeConnect,
} = require('../shared/shops/connect');
const {
  signWixInstance,
  verifyWixSignedInstance,
  verifyWixWebhookHmac,
} = require('../shared/shops/adapters/wix');
const {
  handleMerchantShopsConnect,
  handleMerchantShopsCallback,
} = require('../entry/src/merchantShops');
const {
  matchWixWebhookRoute,
  handleWixWebhook,
} = require('../entry/src/wixWebhooks');
const {
  getAccessToken,
  clearTokenCache,
  peekTokenCache,
} = require('../providers/local/wix/src/token');
const {
  assertWixCreds,
  readWixCreds,
} = require('../providers/local/wix/src/catalog');
const { listProviders } = require('../shared/shops/adapters');

const APP_ID = 'wix-app-id-test';
const SECRET = 'wix-app-secret-test';

function signWebhookBody(raw, secret) {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

describe('FR-237 Wix shop connect', () => {
  it('docs Decision LOCKED + skillbook records oauth2 client_credentials; ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-237.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /instanceId/);
    assert.match(text, /oauth2\/token|client_credentials/);
    assert.match(text, /webhooks\/shop\/wix/);

    const skill = fs.readFileSync(SKILL, 'utf8');
    assert.match(skill, /client_credentials|oauth2\/token/i);
    assert.match(skill, /instanceId/);
    assert.match(skill, /FR-237/);

    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /\/webhooks\/shop\/wix/);
    assert.ok(listProviders().includes('wix'));
  });

  it('startConnect returns Wix installer URL with appId + state', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'wix',
      adapterOpts: { clientId: APP_ID },
      nonces,
      shops,
      callbackBaseUrl: 'https://api.example/merchant/shops/callback/wix',
      nowMs: 1000,
    });
    assert.match(
      started.redirectUrl,
      /^https:\/\/www\.wix\.com\/installer\/install\?/,
    );
    assert.match(started.redirectUrl, /appId=wix-app-id-test/);
    assert.match(started.redirectUrl, /state=/);
    assert.match(started.redirectUrl, /redirectUrl=/);
    assert.equal(shops.listByMerchant('MERCH001', 'sandbox').length, 0);
  });

  it('fixture callback => pending_payment + vault instance only; bad signedInstance no row', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'wix',
      adapterOpts: { clientId: APP_ID },
      nonces,
      shops,
      nowMs: 2000,
    });

    let tokenMintCalls = 0;
    const httpRequest = async (req) => {
      if (String(req.url).includes('/oauth2/token')) {
        tokenMintCalls += 1;
        const body = JSON.parse(String(req.body || '{}'));
        assert.equal(body.grant_type, 'client_credentials');
        assert.equal(body.instance_id, 'inst_ABC');
        assert.ok(!JSON.stringify(req).includes('access_SHOULD_NOT_LOG'));
        return {
          statusCode: 200,
          body: {
            access_token: 'access_SHOULD_NOT_LOG',
            expires_in: 14400,
          },
        };
      }
      if (String(req.url).includes('/apps/v1/instance')) {
        return {
          statusCode: 200,
          body: {
            site: {
              siteDisplayName: 'Demo Wix Store',
              url: 'https://demo-wix.wixsite.com/store',
              siteId: 'site_1',
            },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };

    const signed = signWixInstance(
      { instanceId: 'inst_ABC', siteId: 'site_1' },
      SECRET,
    );
    assert.ok(verifyWixSignedInstance(signed, SECRET));

    const done = await completeConnect({
      provider: 'wix',
      state: started.state,
      req: {
        query: {
          state: started.state,
          instanceId: 'inst_ABC',
          tenantId: 'site_1',
          signedInstance: signed,
        },
      },
      adapterOpts: {
        clientId: APP_ID,
        clientSecret: SECRET,
        httpRequest,
        vault,
      },
      nonces,
      shops,
      nowMs: 3000,
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
    });
    assert.equal(done.shop.status, 'pending_payment');
    assert.equal(done.shop.providerShopId, 'inst_ABC');
    assert.ok(done.shop.credentialsSecretRef == null);
    assert.ok(!JSON.stringify(done).includes('access_SHOULD_NOT_LOG'));
    const stored = vault.get('vault:wix:inst_ABC');
    assert.equal(stored.kind, 'wix_instance');
    assert.equal(stored.instanceId, 'inst_ABC');
    assert.equal(stored.accessToken, undefined);
    assert.ok(tokenMintCalls >= 1);

    const started2 = await startConnect({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'wix',
      adapterOpts: { clientId: APP_ID },
      nonces,
      shops,
      nowMs: 4000,
    });
    const before = shops.listByMerchant('MERCH001', 'sandbox').length;
    await assert.rejects(
      () =>
        completeConnect({
          provider: 'wix',
          state: started2.state,
          req: {
            query: {
              state: started2.state,
              instanceId: 'inst_BAD',
              signedInstance: 'dead.beef',
            },
          },
          adapterOpts: {
            clientId: APP_ID,
            clientSecret: SECRET,
            httpRequest,
            vault,
          },
          nonces,
          shops,
          nowMs: 5000,
          subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
        }),
      (err) => err && err.code === 'invalid_signed_instance',
    );
    assert.equal(shops.listByMerchant('MERCH001', 'sandbox').length, before);
  });

  it('HTTP connect + callback; token absent from 302; bad state 400', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const deps = {
      verifyAuthorization: async () => ({ userId: 'MERCH001' }),
      nonces,
      shops,
      adapterOpts: { clientId: APP_ID, clientSecret: SECRET, vault },
      callbackBaseUrl: 'https://api.example/merchant/shops/callback/wix',
      subscribeBaseUrl: 'https://smartcatalogue.uk/wizard/subscribe',
      nowMs: 6000,
    };
    const start = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({ provider: 'wix' }),
      },
      deps,
    );
    assert.equal(start.statusCode, 200);
    const state = JSON.parse(start.body).state;

    deps.adapterOpts = {
      clientId: APP_ID,
      clientSecret: SECRET,
      vault,
      httpRequest: async (req) => {
        if (String(req.url).includes('/oauth2/token')) {
          return {
            statusCode: 200,
            body: { access_token: 'access_HTTP', expires_in: 100 },
          };
        }
        return {
          statusCode: 200,
          body: { site: { siteDisplayName: 'HTTP', url: 'https://h.wixsite.com/s' } },
        };
      },
    };
    const signed = signWixInstance({ instanceId: 'inst_HTTP' }, SECRET);
    const cb = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/wix',
        requestContext: {
          http: { method: 'GET', path: '/merchant/shops/callback/wix' },
        },
        queryStringParameters: {
          state,
          instanceId: 'inst_HTTP',
          signedInstance: signed,
        },
        body: '',
      },
      deps,
    );
    assert.equal(cb.statusCode, 302);
    assert.ok(!String(cb.headers.location).includes('access_'));
    assert.equal(shops.listByMerchant('MERCH001', 'live').length, 1);

    const bad = await handleMerchantShopsCallback(
      {
        rawPath: '/merchant/shops/callback/wix',
        requestContext: {
          http: { method: 'GET', path: '/merchant/shops/callback/wix' },
        },
        queryStringParameters: {
          state: 'nope',
          signedInstance: signed,
        },
        body: '',
      },
      deps,
    );
    assert.equal(bad.statusCode, 400);
  });

  it('token helper refreshes on expiry (fake clock); never logs token', async () => {
    clearTokenCache();
    let calls = 0;
    const httpRequest = async () => {
      calls += 1;
      return {
        statusCode: 200,
        body: { access_token: `tok_${calls}`, expires_in: 14400 },
      };
    };
    // Cache uses a 60s skew; ttl must exceed skew for a useful hit window.
    const a = await getAccessToken({
      instanceId: 'inst_T',
      appId: APP_ID,
      appSecret: SECRET,
      httpRequest,
      nowMs: 1_000_000,
      ttlMs: 120_000,
      cacheKey: 't1',
    });
    assert.equal(a, 'tok_1');
    const b = await getAccessToken({
      instanceId: 'inst_T',
      appId: APP_ID,
      appSecret: SECRET,
      httpRequest,
      nowMs: 1_010_000,
      ttlMs: 120_000,
      cacheKey: 't1',
    });
    assert.equal(b, 'tok_1');
    assert.equal(calls, 1);
    const c = await getAccessToken({
      instanceId: 'inst_T',
      appId: APP_ID,
      appSecret: SECRET,
      httpRequest,
      nowMs: 1_070_000,
      ttlMs: 120_000,
      cacheKey: 't1',
    });
    assert.equal(c, 'tok_2');
    assert.equal(calls, 2);
    const peeked = peekTokenCache('t1');
    assert.equal(peeked.accessToken, 'tok_2');
    // Helper module source must not console.log tokens
    const src = fs.readFileSync(
      path.join(ROOT, 'providers', 'local', 'wix', 'src', 'token.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /console\.log/);
  });

  it('App Removed webhook => suspended + cancel; bad signature 401', async () => {
    assert.equal(
      matchWixWebhookRoute('POST', '/webhooks/shop/wix'),
      'POST /webhooks/shop/wix',
    );
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const row = shops.insert({
      merchantUserId: 'MERCH001',
      env: 'sandbox',
      provider: 'wix',
      providerShopId: 'inst_GONE',
      shopDomain: 'gone.wixsite.com',
      credentialsSecretRef: 'vault:wix:inst_GONE',
    });
    vault.put(row.credentialsSecretRef, { instanceId: 'inst_GONE' });
    let cancelCalls = 0;
    const raw = Buffer.from(
      JSON.stringify({ instanceId: 'inst_GONE', eventType: 'AppRemoved' }),
      'utf8',
    );
    const un = await handleWixWebhook(
      {
        headers: {
          'x-wix-signature': signWebhookBody(raw, SECRET),
          'x-wix-event-type': 'app_removed',
        },
        body: raw.toString('utf8'),
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

    const bad = await handleWixWebhook(
      {
        headers: {
          'x-wix-signature': 'deadbeef',
          'x-wix-event-type': 'app_removed',
        },
        body: raw.toString('utf8'),
      },
      { clientSecret: SECRET, shops, vault },
    );
    assert.equal(bad.statusCode, 401);
    assert.equal(verifyWixWebhookHmac(raw, signWebhookBody(raw, SECRET), SECRET), true);
  });

  it('catalog accepts per-call siteId+accessToken overrides', () => {
    const c = assertWixCreds(
      {},
      { siteId: 'site_x', accessToken: 'tok' },
    );
    assert.equal(c.siteId, 'site_x');
    assert.equal(c.apiToken, 'tok');
    const envOnly = readWixCreds({
      WIX_SITE_ID: 'env_site',
      WIX_API_TOKEN: 'envtok',
    });
    assert.equal(envOnly.siteId, 'env_site');
  });
});
