'use strict';

/**
 * MRB #684 hostile: FR-066 kelkoo selftestProbe + rateLimit stay-dark.
 * Refs SimonBarnett/a-search#684 / #619
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #684 hostile FR-066 kelkoo selftest', () => {
  it('selftestProbe exports and fixture ok path', async () => {
    const {
      probeKelkooSelftest,
      DEFAULT_FIXTURE,
    } = require('../providers/live/kelkoo/src/selftestProbe');
    assert.equal(typeof probeKelkooSelftest, 'function');
    assert.ok(fs.existsSync(DEFAULT_FIXTURE));
    const r = await probeKelkooSelftest({
      env: { KELKOO_API_KEY: 't', KELKOO_COUNTRY: 'uk' },
    });
    assert.equal(r.ok, true);
    assert.equal(r.source, 'kelkoo');
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.equal(kk.enabled.live, false);
    assert.equal(kk.enabled.sandbox, false);
    assert.equal(kk.rateLimit.maxConcurrency, 1);
    assert.equal(kk.rateLimit.minIntervalMs, 250);
  });

  it('skill documents FR-066 selftest + rateLimit', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers/live/kelkoo/.grok/skills/a-search-kelkoo/SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-066|Selftest/i);
    assert.match(skill, /selftestProbe/);
    assert.match(skill, /rateLimit|maxConcurrency|minIntervalMs/);
  });
});
