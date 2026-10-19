'use strict';

/**
 * FR #4451: /search fan-out on AWS is search providers only (amazon, ebay) + sql.
 * rakuten, cj, kelkoo, skimlinks and etsy are affiliates in SQL, not AWS workers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveFanOutTargets } = require('../entry/src/agentSearch');
const { loadRegistry, isAwsSearchProvider } = require('../providers/loadRegistry');

const OFF_AWS = ['rakuten', 'cj', 'kelkoo', 'skimlinks', 'etsy'];

describe('FR #4451 AWS search-provider fan-out', () => {
  it('fan-out targets are exactly amazon, ebay and sql', () => {
    assert.deepEqual(resolveFanOutTargets('live'), ['amazon', 'ebay', 'sql']);
    assert.deepEqual(resolveFanOutTargets('sandbox'), ['amazon', 'ebay', 'sql']);
  });

  it('only amazon and ebay are AWS search providers', () => {
    const { sources } = loadRegistry();
    const aws = sources.filter(isAwsSearchProvider).map((s) => s.id);
    assert.deepEqual(aws, ['amazon', 'ebay']);
    for (const id of OFF_AWS) {
      const src = sources.find((s) => s.id === id);
      assert.equal(src.class, 'provider', id);
      assert.equal(src.awsSearch, undefined, id);
      assert.equal(src.enabled.live, false, id);
      assert.equal(src.enabled.sandbox, false, id);
      assert.equal(isAwsSearchProvider(src), false, id);
    }
  });

  it('search-fanout docs match: search providers on AWS, walrus drains SQL', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(text, /Only search providers run on\s+AWS/);
    assert.match(text, /Amazon/);
    assert.match(text, /eBay/);
    assert.match(text, /Walrus drains the SQL queue/);
    assert.doesNotMatch(text, /drained on redqueen/);
  });
});
