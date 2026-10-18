'use strict';

/**
 * MRB #2174 hostile pins for FR-243 Magento OAuth 1.0a (#1357).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const { MERCHANT_SHOP_PROVIDERS } = require('../shared/shops/registry');
const { listProviders, getAdapter } = require('../shared/shops/adapters');
const {
  receiveActivation,
  clearPendingActivations,
  completeConnect: magentoComplete,
} = require('../shared/shops/adapters/magento');
const { createCredentialsVault } = require('../shared/shops/vault');
const { signOAuth1 } = require('../providers/local/magento/src/oauth1');

describe('MRB #2174 hostile FR-243 Magento', () => {
  it('keep-both registry: squarespace + magento stay-dark; adapters listed', () => {
    assert.ok(MERCHANT_SHOP_PROVIDERS.includes('magento'));
    assert.ok(MERCHANT_SHOP_PROVIDERS.includes('squarespace'));
    const providers = listProviders();
    assert.ok(providers.includes('magento'));
    assert.ok(providers.includes('squarespace'));
    assert.equal(getAdapter('magento'), require('../shared/shops/adapters/magento'));
    assert.equal(
      getAdapter('squarespace'),
      require('../shared/shops/adapters/squarespace'),
    );
    const reg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'providers', 'registry.json'), 'utf8'),
    );
    const sources = reg.sources || [];
    const mag = sources.find((p) => p.id === 'magento');
    const sq = sources.find((p) => p.id === 'squarespace');
    assert.ok(mag && sq);
    assert.equal(mag.enabled.live, false);
    assert.equal(sq.enabled.live, false);
    assert.equal(mag.queueEnv, 'SQS_MAGENTO_URL');
  });

  it('default signature HMAC-SHA256; activation expires after TTL', async () => {
    const signed = signOAuth1({
      method: 'GET',
      url: 'https://shop.example.com/rest/V1/products',
      consumerKey: 'a',
      consumerSecret: 'b',
    });
    assert.equal(signed.oauthParams.oauth_signature_method, 'HMAC-SHA256');

    clearPendingActivations();
    receiveActivation(
      {
        store_base_url: 'https://demo.magento.test/',
        oauth_verifier: 'v',
        oauth_consumer_key: 'ck_exp',
        oauth_consumer_secret: 'cs_exp',
      },
      { nowMs: 1000 },
    );
    await assert.rejects(
      () =>
        magentoComplete(
          { query: { oauth_consumer_key: 'ck_exp' } },
          {
            nowMs: 1000 + 11 * 60 * 1000,
            httpRequest: async () => ({ statusCode: 200, body: '' }),
            vault: createCredentialsVault(),
          },
        ),
      (e) => e && e.code === 'activation_expired',
    );
  });

  it('skillbook layout + FR-243 Decision LOCKED ASCII; taxonomy lists Magento', () => {
    const skill = path.join(
      ROOT,
      'providers',
      'local',
      'magento',
      '.grok',
      'skills',
      'a-search-magento',
      'SKILL.md',
    );
    const agents = path.join(ROOT, 'providers', 'local', 'magento', 'AGENTS.md');
    assert.ok(fs.existsSync(skill));
    assert.ok(fs.existsSync(agents));
    const frBuf = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-243.md'));
    assert.notEqual(frBuf[0], 0xef);
    for (const b of frBuf) assert.ok(b < 128);
    assert.match(frBuf.toString('utf8'), /Decision\s*\(LOCKED\)/i);
    assert.match(frBuf.toString('utf8'), /HMAC-SHA256/);
    const merchant = fs.readFileSync(
      path.join(ROOT, 'docs', 'components-piece-merchant.md'),
      'utf8',
    );
    assert.match(merchant, /Magento/);
    assert.match(merchant, /FR-243|#1357/);
  });

  it('CDK + entry route magento identity; no conflict markers on tip', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /\/merchant\/shops\/magento\/identity/);
    const idx = fs.readFileSync(
      path.join(ROOT, 'shared', 'shops', 'adapters', 'index.js'),
      'utf8',
    );
    assert.doesNotMatch(idx, /^<<<<<<<|^>>>>>>>/m);
    const reg = fs.readFileSync(
      path.join(ROOT, 'providers', 'registry.json'),
      'utf8',
    );
    assert.doesNotMatch(reg, /<<<<<<</);
  });
});
