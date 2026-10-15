'use strict';

/**
 * MRB #2170 hostile pins for FR-242 Squarespace connect (#1356).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const { MERCHANT_SHOP_PROVIDERS } = require('../shared/shops/registry');
const {
  createNonceStore,
  createShopsRegistry,
  startConnect,
  completeConnect,
} = require('../shared/shops/connect');
const { createCredentialsVault } = require('../shared/shops/vault');
const {
  fetchProductsPage,
} = require('../providers/local/squarespace/src/catalog');

describe('MRB #2170 hostile FR-242 Squarespace', () => {
  it('merchant provider enum + skillbook layout + stay-dark registry', () => {
    assert.ok(MERCHANT_SHOP_PROVIDERS.includes('squarespace'));
    const skill = path.join(
      ROOT,
      'providers',
      'local',
      'squarespace',
      '.grok',
      'skills',
      'a-search-squarespace',
      'SKILL.md',
    );
    const onboard = path.join(
      ROOT,
      'providers',
      'local',
      'squarespace',
      '.grok',
      'skills',
      'a-search-squarespace-onboarding',
      'SKILL.md',
    );
    const agents = path.join(
      ROOT,
      'providers',
      'local',
      'squarespace',
      'AGENTS.md',
    );
    const envEx = path.join(
      ROOT,
      'providers',
      'local',
      'squarespace',
      '.env.example',
    );
    for (const p of [skill, onboard, agents, envEx]) {
      assert.ok(fs.existsSync(p), 'missing ' + p);
    }
    const envText = fs.readFileSync(envEx, 'utf8');
    assert.doesNotMatch(envText, /sk_live_[A-Za-z0-9]+|sqsp_[A-Za-z0-9]{8,}/i);
    assert.doesNotMatch(envText, /PASSWORD=[^\s#]+/i);
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const sources = reg.sources || reg.providers || reg;
    const sq = sources.find((p) => p.id === 'squarespace');
    assert.equal(sq.enabled.live, false);
    assert.equal(sq.enabled.sandbox, false);
    assert.equal(sq.rateLimit.maxConcurrency, 1);
    assert.equal(sq.rateLimit.minIntervalMs, 250);
  });

  it('connect response credentials are vault pointer only (no raw tokens/keys)', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'M_HOSTILE',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: 'cid' },
      nonces,
      shops,
      nowMs: 1,
    });
    const httpRequest = async (req) => {
      if (String(req.url).includes('/tokens')) {
        return {
          statusCode: 200,
          body: {
            access_token: 'ACCESS_LEAK_PROBE',
            refresh_token: 'REFRESH_LEAK_PROBE',
          },
        };
      }
      if (String(req.url).includes('/website')) {
        return {
          statusCode: 200,
          body: {
            website: {
              id: 'site_h',
              domain: 'h.squarespace.com',
              title: 'H',
            },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };
    const done = await completeConnect({
      provider: 'squarespace',
      state: started.state,
      req: { query: { code: 'c1' } },
      adapterOpts: {
        clientId: 'cid',
        clientSecret: 'sec',
        httpRequest,
        vault,
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 2,
    });
    const blob = JSON.stringify(done);
    assert.ok(!blob.includes('ACCESS_LEAK_PROBE'));
    assert.ok(!blob.includes('REFRESH_LEAK_PROBE'));
    assert.ok(done.shop.credentialsSecretRef || done.shop);
    const full = shops.get(done.shop.shopId);
    assert.match(String(full.credentialsSecretRef), /^vault:squarespace:/);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.refreshToken, 'REFRESH_LEAK_PROBE');
    // Short-lived access may be vaulted for first sync; must never leave API JSON.
    assert.ok(creds.refreshToken);
  });

  it('api_key vault sets reconnectOauthPreferred; catalog 429 surfaces rate_limited', async () => {
    const nonces = createNonceStore();
    const shops = createShopsRegistry();
    const vault = createCredentialsVault();
    const started = await startConnect({
      merchantUserId: 'M_KEY',
      env: 'sandbox',
      provider: 'squarespace',
      adapterOpts: { clientId: 'cid' },
      nonces,
      shops,
      nowMs: 10,
    });
    const httpRequest = async (req) => {
      if (String(req.url).includes('/commerce/products')) {
        return { statusCode: 200, body: { products: [] } };
      }
      if (String(req.url).includes('/website')) {
        return {
          statusCode: 200,
          body: {
            website: { id: 'site_k', domain: 'k.squarespace.com', title: 'K' },
          },
        };
      }
      return { statusCode: 404, body: {} };
    };
    const done = await completeConnect({
      provider: 'squarespace',
      state: started.state,
      req: { body: { apiKey: 'KEY_SECRET_VALUE' } },
      adapterOpts: {
        clientId: 'cid',
        clientSecret: 'sec',
        httpRequest,
        vault,
        env: { SQUARESPACE_API_KEY_FALLBACK: 'true' },
      },
      nonces,
      shops,
      subscribeBaseUrl: 'https://example/subscribe',
      nowMs: 11,
    });
    const full = shops.get(done.shop.shopId);
    const creds = vault.get(full.credentialsSecretRef);
    assert.equal(creds.authMethod, 'api_key');
    assert.equal(creds.reconnectOauthPreferred, true);
    assert.ok(!JSON.stringify(done).includes('KEY_SECRET_VALUE'));

    await assert.rejects(
      () =>
        fetchProductsPage({
          accessToken: 't',
          httpRequest: async () => ({
            statusCode: 429,
            headers: { 'retry-after': '2' },
            body: {},
          }),
        }),
      (err) => err && err.code === 'rate_limited',
    );
  });

  it('FR-242.md Decision LOCKED ASCII no-BOM; vision taxonomy lists Squarespace', () => {
    const frPath = path.join(ROOT, 'docs', 'fr', 'FR-242.md');
    const buf = fs.readFileSync(frPath);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128);
    assert.match(buf.toString('utf8'), /Decision\s*\(LOCKED\)/i);
    const merchant = fs.readFileSync(
      path.join(ROOT, 'docs', 'components-piece-merchant.md'),
      'utf8',
    );
    assert.match(merchant, /Squarespace/);
    assert.match(merchant, /FR-242|#1356/);
  });
});
