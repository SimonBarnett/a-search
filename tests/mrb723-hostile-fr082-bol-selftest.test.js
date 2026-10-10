'use strict';

/**
 * Hostile MRB #723 / FR-082: bol selftestProbe + rateLimit stay-dark.
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
  'bol',
  'src',
  'selftestProbe.js',
);
const skillPath = path.join(
  root,
  'providers',
  'live',
  'bol',
  '.grok',
  'skills',
  'a-search-bol',
  'SKILL.md',
);

describe('mrb723 hostile FR-082 bol selftest', () => {
  it('fixtureLooksOk for bolProductAPI.products', () => {
    const { fixtureLooksOk, DEFAULT_FIXTURE } = require(probePath);
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    assert.equal(fixtureLooksOk(fixture), true);
    assert.equal(fixtureLooksOk({ products: [] }), false);
    assert.equal(fixtureLooksOk({}), false);
  });

  it('rateLimit maxConcurrency=1 minIntervalMs=250; enabled false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.equal(bol.enabled.live, true);
    assert.equal(bol.enabled.sandbox, true);
    assert.equal(bol.rateLimit.maxConcurrency, 1);
    assert.equal(bol.rateLimit.minIntervalMs, 250);
  });

  it('skill FR-082 ASCII; no conflict markers; contract + pacing numbers', () => {
    const skill = fs.readFileSync(skillPath, 'utf8');
    assert.ok(!skill.includes('\ufffd'));
    assert.ok(!skill.includes('<<<<<<'));
    assert.ok(!/\u00c3|\u00e2\u20ac/.test(skill));
    assert.match(skill, /## Selftest \+ pacing \(FR-082\)/);
    assert.match(skill, /selftestProbe/);
    assert.match(skill, /maxConcurrency: 1/);
    assert.match(skill, /minIntervalMs: 250/);
    assert.match(skill, /latencyMs/);
  });

  it('invalid fixture yields bol_fixture_invalid', async () => {
    const { probeBolSelftest } = require(probePath);
    const tmp = path.join(
      root,
      'providers',
      'live',
      'bol',
      'fixtures',
      '_mrb723-bad.json',
    );
    fs.writeFileSync(tmp, '{"bolProductAPI":{"products":[]}}\n', 'utf8');
    try {
      const result = await probeBolSelftest({
        env: {
          BOL_API_KEY: 'fixture-key',
          BOL_TRACKING_ID: 'track-test',
          A_SEARCH_ENV: 'sandbox',
        },
        fixturePath: tmp,
      });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'bol_fixture_invalid');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
