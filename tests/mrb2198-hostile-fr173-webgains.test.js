'use strict';

/**
 * docs/mrb-2198 hostile pin for FR-173 enable webgains (PR #2198 / #1020).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB-2198 FR-173 webgains enable hostile', () => {
  it('registry webgains both envs true; PROVIDER_CREDENTIAL_KEYS contiguous', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const wg = registry.sources.find((s) => s.id === 'webgains');
    assert.ok(wg);
    assert.equal(wg.enabled.live, true);
    assert.equal(wg.enabled.sandbox, true);
    assert.equal(wg.kind, 'local');
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(
      stack,
      /webgains:\s*\[\s*'WEBGAINS_API_KEY',\s*'WEBGAINS_API_TOKEN',\s*'WEBGAINS_FEED_TOKEN',\s*'WEBGAINS_PUBLISHER_ID',\s*'WEBGAINS_CAMPAIGN_ID',?\s*\]/,
    );
    assert.doesNotMatch(stack, /^<<<<<<<|^=======|^>>>>>>>/m);
  });

  it('FR-173 Decision LOCKED UTF-8 no-BOM; floors 28; siblings dark', () => {
    const buf = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-173.md'));
    assert.notEqual(buf[0], 0xef);
    const fr = buf.toString('utf8');
    assert.ok(!/[\u2013\u2014]/.test(fr));
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /WEBGAINS_API_KEY/);
    assert.match(fr, /WEBGAINS_CAMPAIGN_ID/);
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    for (const id of ['admitad', 'flexoffers']) {
      const s = registry.sources.find((x) => x.id === id);
      assert.equal(s.enabled.live, false, id);
      assert.equal(s.enabled.sandbox, false, id);
    }
    const both = registry.sources.filter(
      (s) => s.enabled && s.enabled.live && s.enabled.sandbox,
    );
    assert.equal(both.length, 15);
    const fr142 = fs.readFileSync(
      path.join(root, 'tests', 'fr142-sqs-dlq.test.js'),
      'utf8',
    );
    assert.match(fr142, /expected 30 primary queues/);
  });
});