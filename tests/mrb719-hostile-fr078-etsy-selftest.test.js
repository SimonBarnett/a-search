'use strict';

/**
 * Hostile MRB #719 / FR-078: etsy selftestProbe + rateLimit stay-dark.
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
  'etsy',
  'src',
  'selftestProbe.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'etsy',
  '.grok',
  'skills',
  'a-search-etsy',
  'SKILL.md',
);

describe('mrb719 hostile FR-078 etsy selftest', () => {
  it('fixtureLooksOk for etsyProductAPI.results', () => {
    const { fixtureLooksOk, DEFAULT_FIXTURE } = require(probePath);
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    assert.equal(fixtureLooksOk(fixture), true);
    assert.equal(fixtureLooksOk({ results: [] }), false);
    assert.equal(fixtureLooksOk({}), false);
  });

  it('rateLimit maxConcurrency=1 minIntervalMs=250; enabled false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);
    assert.equal(et.rateLimit.maxConcurrency, 1);
    assert.equal(et.rateLimit.minIntervalMs, 250);
  });

  it('skill FR-078 ASCII; no conflict markers', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!skill.includes('<<<<<<'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Selftest \+ pacing \(FR-078\)/);
    assert.match(skill, /selftestProbe/);
    assert.match(skill, /maxConcurrency: 1/);
    assert.match(skill, /minIntervalMs: 250/);
  });

  it('invalid fixture yields etsy_fixture_invalid', async () => {
    const { probeEtsySelftest } = require(probePath);
    const tmp = path.join(
      root,
      'providers',
      'live',
      'etsy',
      'fixtures',
      '_mrb719-bad.json',
    );
    fs.writeFileSync(tmp, '{"etsyProductAPI":{"results":[]}}\n', 'utf8');
    try {
      const result = await probeEtsySelftest({
        env: { ETSY_API_KEY: 'k', A_SEARCH_ENV: 'sandbox' },
        fixturePath: tmp,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'etsy_fixture_invalid');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
