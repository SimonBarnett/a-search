'use strict';

/**
 * docs/mrb-2181: hostile contiguous pins for FR-244 Etsy shared-secret + Rakuten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('docs/mrb-2181 hostile FR-244 pins', () => {
  it('search.js builds keystring:shared_secret and fails closed', () => {
    const src = read('providers/live/etsy/src/search.js');
    assert.match(src, /function buildEtsyApiKeyHeader/);
    assert.match(src, /missing_shared_secret/);
    assert.match(src, /ETSY_SHARED_SECRET/);
    assert.match(src, /includes.*Images|searchParams\.set\('includes',\s*'Images'\)/);
  });

  it('affiliateUrl Rakuten default with u1; fail closed; Awin fallback', () => {
    const src = read('providers/live/etsy/src/affiliateUrl.js');
    assert.match(src, /click\.linksynergy\.com\/deeplink/);
    assert.match(src, /searchParams\.set\('u1'/);
    assert.match(src, /fail closed/);
    assert.match(src, /awinmid|awinaffid/);
    assert.match(src, /cleanListingUrl/);
  });

  it('FR-244.md Decision LOCKED pins PROVIDER auth + affiliate', () => {
    const doc = read('docs/fr/FR-244.md');
    assert.match(doc, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(doc, /keystring:\{shared_secret\}|keystring:shared_secret/);
    assert.match(doc, /ETSY_SHARED_SECRET/);
    assert.match(doc, /rakuten/i);
    assert.match(doc, /PROVIDER/);
  });

  it('CDK credential map includes ETSY_SHARED_SECRET; network default rakuten', () => {
    const stack = read('cdk/lib/a-search-stack.js');
    assert.match(stack, /ETSY_SHARED_SECRET/);
    assert.match(stack, /ETSY_AFFILIATE_NETWORK:\s*'rakuten'/);
    assert.equal(stack.includes('ETSY_TRACKING_ID'), false);
  });

  it('fr244 suite asserts header colon + affiliate wrap', () => {
    const t = read('tests/fr244-etsy-auth-affiliate.test.js');
    assert.match(t, /missing_shared_secret|shared.secret/i);
    assert.match(t, /Rakuten|linksynergy|u1/i);
    assert.match(t, /Awin|awinmid/i);
  });
});
