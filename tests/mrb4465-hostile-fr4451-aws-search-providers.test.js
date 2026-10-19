'use strict';

/**
 * MRB #4465 hostile pins for FR #4451 (product PR #4465).
 * AWS fan-out = live API search providers + sql; skimlinks and other locals stay off AWS queues.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveFanOutTargets } = require('../entry/src/agentSearch');
const { loadRegistry, isAwsSearchProvider } = require('../providers/loadRegistry');

const AWS_ON = ['amazon', 'ebay', 'rakuten', 'cj', 'kelkoo', 'etsy'];
const LOCAL_NEVER_AWS = [
  'skimlinks', 'awin', 'impact', 'partnerize', 'webgains', 'tradedoubler',
  'admitad', 'flexoffers', 'avantlink', 'shopify', 'wix', 'woocommerce',
  'squarespace', 'magento', 'ecwid', 'bigcommerce',
];

describe('MRB #4465 hostile FR #4451 AWS search providers', () => {
  it('fan-out is exactly enabled awsSearch providers plus sql', () => {
    assert.deepEqual(resolveFanOutTargets('live'), [...AWS_ON, 'sql']);
  });

  it('affiliates and merchants are never awsSearch fan-out targets', () => {
    const { sources } = loadRegistry();
    const byId = new Map(sources.map((s) => [s.id, s]));
    const targets = new Set(resolveFanOutTargets('live'));
    for (const id of LOCAL_NEVER_AWS) {
      const src = byId.get(id);
      assert.ok(src, id);
      assert.equal(isAwsSearchProvider(src), false, id);
      assert.equal(targets.has(id), false, id);
    }
    const sk = byId.get('skimlinks');
    assert.equal(sk.kind, 'local');
    assert.equal(sk.class, 'affiliate');
    assert.match(sk.folder, /providers\/local\/skimlinks/);
  });

  it('CDK stack skips local and non-awsSearch sources for per-provider workers', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /isAwsSearchProvider\(src\)/);
    assert.match(text, /Local\/SQL sources \(including skimlinks\)/);
  });
});
