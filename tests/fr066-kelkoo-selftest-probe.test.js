'use strict';

/**
 * FR-066: kelkoo selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeKelkooSelftest,
  kelkooSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/kelkoo/src/selftestProbe');

const credEnv = {
  KELKOO_API_KEY: 'fixture-token',
  KELKOO_COUNTRY: 'uk',
  A_SEARCH_ENV: 'sandbox',
};

describe('FR-066 kelkoo selftestProbe + rateLimit', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'offers-ok.json required');
    let t = 0;
    const result = await probeKelkooSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'kelkoo');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeKelkooSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'kelkoo');
    assert.equal(result.error, 'kelkoo_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeKelkooSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(String(req.url), /\/search\/offers/);
        assert.match(String(req.headers.Authorization), /^Bearer /);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('kelkooSelftestProbe rejects non-kelkoo source', async () => {
    const result = await kelkooSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('registry rateLimit.maxConcurrency is a positive integer; FR-167 enabled', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const kk = registry.sources.find((s) => s.id === 'kelkoo');
    assert.ok(kk, 'registry missing kelkoo');
    assert.equal(kk.enabled.live, true);
    assert.equal(kk.enabled.sandbox, true);
    assert.ok(kk.rateLimit && typeof kk.rateLimit === 'object');
    assert.equal(typeof kk.rateLimit.maxConcurrency, 'number');
    assert.ok(kk.rateLimit.maxConcurrency >= 1);
    assert.equal(typeof kk.rateLimit.minIntervalMs, 'number');
    assert.ok(kk.rateLimit.minIntervalMs >= 0);
  });

  it('selftestProbe module lives under providers/live/kelkoo', () => {
    const p = path.join(
      root,
      'providers',
      'live',
      'kelkoo',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});

