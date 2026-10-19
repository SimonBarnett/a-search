'use strict';

/**
 * FR #4451: /search fan-out is the enabled live API search providers + sql.
 * Skimlinks has no keyword-search API, so it is a local affiliate (SQL), not an AWS worker.
 * AliExpress and Bol stay registry-disabled.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveFanOutTargets } = require('../entry/src/agentSearch');
const { loadRegistry, isAwsSearchProvider } = require('../providers/loadRegistry');

const AWS_ON = ['amazon', 'ebay', 'rakuten', 'cj', 'kelkoo', 'etsy'];
const AWS_HOLD = ['aliexpress', 'bol'];

describe('FR #4451 AWS search-provider fan-out', () => {
  it('fan-out targets are the enabled search providers plus sql', () => {
    const expected = [...AWS_ON, 'sql'];
    assert.deepEqual(resolveFanOutTargets('live'), expected);
    assert.deepEqual(resolveFanOutTargets('sandbox'), expected);
  });

  it('awsSearch is the live API providers; skimlinks is a local affiliate', () => {
    const { sources } = loadRegistry();
    const byId = new Map(sources.map((s) => [s.id, s]));
    for (const id of AWS_ON) {
      const src = byId.get(id);
      assert.equal(src.kind, 'live', id);
      assert.equal(src.awsSearch, true, id);
      assert.equal(src.enabled.live, true, id);
      assert.equal(src.enabled.sandbox, true, id);
      assert.equal(isAwsSearchProvider(src), true, id);
    }
    for (const id of AWS_HOLD) {
      const src = byId.get(id);
      assert.equal(src.awsSearch, true, id);
      assert.equal(src.enabled.live, false, id);
      assert.equal(isAwsSearchProvider(src), true, id);
    }
    const sk = byId.get('skimlinks');
    assert.equal(sk.kind, 'local');
    assert.equal(sk.class, 'affiliate');
    assert.equal(sk.folder, 'providers/local/skimlinks');
    assert.equal(sk.awsSearch, undefined);
    assert.equal(sk.enabled.live, true);
    assert.equal(isAwsSearchProvider(sk), false);
    assert.equal(resolveFanOutTargets('live').includes('skimlinks'), false);
  });

  it('search-fanout docs match the provider split and the walrus drain', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(text, /Only search\s+providers run on AWS/);
    assert.match(text, /Rakuten, CJ, Kelkoo and\s+Etsy/);
    assert.match(text, /Skimlinks/);
    assert.match(text, /## SQL SQS: drained on walrus/);
    assert.match(text, /No AWS Lambda connects to MSSQL/);
    assert.match(text, /madeiradb stays SELECT-only/);
    assert.doesNotMatch(text, /## SQL SQS: drained on redqueen/);
  });
});
