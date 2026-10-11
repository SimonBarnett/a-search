'use strict';

/**
 * Hostile MRB #712 / FR-074: aliexpress selftestProbe + rateLimit enabled (FR-169).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const probePath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  'src',
  'selftestProbe.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'aliexpress',
  '.grok',
  'skills',
  'a-search-aliexpress',
  'SKILL.md',
);

describe('mrb712 hostile FR-074 aliexpress selftest', () => {
  it('probe module + fixtureLooksOk for aliexpressProductAPI', () => {
    const {
      fixtureLooksOk,
      probeAliexpressSelftest,
      DEFAULT_FIXTURE,
    } = require(probePath);
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    assert.equal(fixtureLooksOk(fixture), true);
    assert.equal(fixtureLooksOk({}), false);
    assert.equal(typeof probeAliexpressSelftest, 'function');
  });

  it('rateLimit maxConcurrency=1 minIntervalMs=250; enabled true (FR-169)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.equal(ae.enabled.live, true);
    assert.equal(ae.enabled.sandbox, true);
    assert.equal(ae.rateLimit.maxConcurrency, 1);
    assert.equal(ae.rateLimit.minIntervalMs, 250);
  });

  it('skill FR-074 section has no mojibake; documents selftestProbe', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Selftest \+ pacing \(FR-074\)/);
    assert.match(skill, /selftestProbe/);
    assert.match(skill, /maxConcurrency: 1/);
    assert.match(skill, /minIntervalMs: 250/);
  });

  it('invalid fixture JSON yields aliexpress_fixture_invalid', async () => {
    const { probeAliexpressSelftest } = require(probePath);
    const tmp = path.join(root, 'providers', 'live', 'aliexpress', 'fixtures', '_mrb712-bad.json');
    fs.writeFileSync(tmp, '{"aliexpressProductAPI":{"products":[]}}\n', 'utf8');
    try {
      const result = await probeAliexpressSelftest({
        env: {
          ALIEXPRESS_API_KEY: 'k',
          A_SEARCH_ENV: 'sandbox',
        },
        fixturePath: tmp,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'aliexpress_fixture_invalid');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
