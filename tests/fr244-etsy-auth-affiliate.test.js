'use strict';

/**
 * FR-244 / #1358: Etsy x-api-key shared secret + Rakuten/Awin affiliate wrap.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-244.md');

const {
  assertEtsyCreds,
  readEtsyCreds,
  buildEtsyApiKeyHeader,
  buildListingsSearchUrl,
  searchEtsy,
  EtsyCredsError,
} = require('../providers/live/etsy/src/search');
const {
  buildEtsyAffiliateUrl,
  cleanListingUrl,
  resolveAffiliateNetwork,
} = require('../providers/live/etsy/src/affiliateUrl');
const {
  normalizeEtsyListing,
} = require('../providers/live/etsy/src/normalize');
const {
  probeEtsySelftest,
} = require('../providers/live/etsy/src/selftestProbe');

describe('FR-244 etsy auth + affiliate', () => {
  it('Decision LOCKED docs ASCII no-BOM; env + CDK secret keys', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-244.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /Decision\s*\(LOCKED\)/i);
    assert.match(text, /keystring:shared_secret|ETSY_SHARED_SECRET/);
    assert.match(text, /rakuten/i);
    assert.match(text, /linksynergy|deeplink/i);
    const env = fs.readFileSync(
      path.join(ROOT, 'providers', 'live', 'etsy', '.env.example'),
      'utf8',
    );
    assert.match(env, /^ETSY_SHARED_SECRET=$/m);
    assert.match(env, /^ETSY_AFFILIATE_NETWORK=rakuten$/m);
    assert.match(env, /^ETSY_RAKUTEN_MID=$/m);
    assert.doesNotMatch(env, /^ETSY_TRACKING_ID=/m);
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /ETSY_SHARED_SECRET/);
    assert.match(stack, /ETSY_AFFILIATE_NETWORK:\s*'rakuten'/);
  });

  it('x-api-key is keystring:secret; colon pass-through; missing secret fails', () => {
    assert.equal(buildEtsyApiKeyHeader('ks', 'sec'), 'ks:sec');
    assert.equal(buildEtsyApiKeyHeader('ks:already', 'ignored'), 'ks:already');
    assert.equal(buildEtsyApiKeyHeader('ks', ''), '');

    const ok = assertEtsyCreds({
      ETSY_API_KEY: 'keystr',
      ETSY_SHARED_SECRET: 'shh',
    });
    assert.equal(ok.apiKey, 'keystr:shh');

    const embedded = assertEtsyCreds({ ETSY_API_KEY: 'a:b' });
    assert.equal(embedded.apiKey, 'a:b');

    assert.throws(
      () => assertEtsyCreds({ ETSY_API_KEY: 'onlykey' }),
      (e) => e instanceof EtsyCredsError && e.code === 'missing_shared_secret',
    );
    assert.throws(
      () => assertEtsyCreds({}),
      (e) => e && e.code === 'etsy_missing_credentials',
    );
    assert.equal(readEtsyCreds({ ETSY_KEYSTRING: 'k', ETSY_SHARED_SECRET: 's' }).apiKey, 'k:s');
  });

  it('search sends combined header and includes=Images', async () => {
    let captured;
    await searchEtsy(
      { q: 'mug' },
      {
        env: { ETSY_API_KEY: 'k', ETSY_SHARED_SECRET: 's' },
        httpRequest: async (req) => {
          captured = req;
          return { results: [] };
        },
      },
    );
    assert.equal(captured.headers['x-api-key'], 'k:s');
    assert.match(captured.url, /includes=Images/);
    assert.match(captured.url, /keywords=mug/);

    const url = buildListingsSearchUrl(
      { baseUrl: 'https://openapi.etsy.com/v3' },
      'x',
      { limit: 200 },
    );
    assert.match(url, /limit=100/);
  });

  it('selftest reports missing_shared_secret distinctly', async () => {
    const r = await probeEtsySelftest({
      env: { ETSY_API_KEY: 'k' },
      now: () => 1,
    });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'missing_shared_secret');
  });

  it('Rakuten mode wraps cleaned listing; fail closed without ids', () => {
    assert.equal(resolveAffiliateNetwork({}), 'rakuten');
    const cleaned = cleanListingUrl(
      'https://www.etsy.com/listing/1/thing?ref=x#frag',
    );
    assert.equal(cleaned, 'https://www.etsy.com/listing/1/thing');

    const wrapped = buildEtsyAffiliateUrl({
      url: 'https://www.etsy.com/listing/99/cup?utm=1',
      userId: 'tenant42',
      envVars: {
        ETSY_AFFILIATE_NETWORK: 'rakuten',
        RAKUTEN_PUBLISHER_ID: 'pub1',
        ETSY_RAKUTEN_MID: 'midEtsy',
      },
    });
    const u = new URL(wrapped);
    assert.equal(u.hostname, 'click.linksynergy.com');
    assert.equal(u.pathname, '/deeplink');
    assert.equal(u.searchParams.get('id'), 'pub1');
    assert.equal(u.searchParams.get('mid'), 'midEtsy');
    assert.equal(u.searchParams.get('u1'), 'tenant42');
    assert.equal(
      u.searchParams.get('murl'),
      'https://www.etsy.com/listing/99/cup',
    );

    assert.throws(
      () =>
        buildEtsyAffiliateUrl({
          url: 'https://www.etsy.com/listing/1',
          userId: 'u',
          envVars: { ETSY_RAKUTEN_MID: 'm' },
        }),
      (e) => e && e.code === 'tracked_url_missing_account',
    );
  });

  it('Awin mode wraps with awinmid/awinaffid/clickref/ued', () => {
    const wrapped = buildEtsyAffiliateUrl({
      url: 'https://www.etsy.com/listing/7/hat',
      userId: 'jwtUser',
      envVars: {
        ETSY_AFFILIATE_NETWORK: 'awin',
        ETSY_AWIN_MID: '111',
        AWIN_PUBLISHER_ID: '222',
      },
    });
    const u = new URL(wrapped);
    assert.equal(u.hostname, 'www.awin1.com');
    assert.equal(u.searchParams.get('awinmid'), '111');
    assert.equal(u.searchParams.get('awinaffid'), '222');
    assert.equal(u.searchParams.get('clickref'), 'jwtUser');
    assert.equal(
      u.searchParams.get('ued'),
      'https://www.etsy.com/listing/7/hat',
    );
  });

  it('normalize uses affiliate wrap; no secrets in product JSON', () => {
    const product = normalizeEtsyListing(
      {
        listing_id: 55,
        title: 'Mug',
        url: 'https://www.etsy.com/listing/55/mug?ref=old',
        price: { amount: 1250, divisor: 100, currency_code: 'GBP' },
      },
      {
        userId: 'u1',
        envVars: {
          RAKUTEN_SITE_ID: 'site9',
          ETSY_RAKUTEN_MID: 'etsyMid',
        },
      },
    );
    assert.match(product.url, /linksynergy\.com\/deeplink/);
    assert.match(product.url, /u1=u1/);
    assert.ok(!JSON.stringify(product).includes('shh'));
    assert.ok(!product.url.includes('ref=old'));
  });
});
