'use strict';

/**
 * FR-070: skimlinks selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeSkimlinksSelftest,
  skimlinksSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/skimlinks/src/selftestProbe');

const credEnv = {
  SKIMLINKS_API_KEY: 'fixture-key',
  SKIMLINKS_COUNTRY: 'uk',
  A_SEARCH_ENV: 'sandbox',
};

describe('FR-070 skimlinks selftestProbe + rateLimit', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.json required');
    let t = 0;
    const result = await probeSkimlinksSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'skimlinks');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeSkimlinksSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'skimlinks');
    assert.equal(result.error, 'skimlinks_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeSkimlinksSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(String(req.url), /product\/query/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('skimlinksSelftestProbe rejects non-skimlinks source', async () => {
    const result = await skimlinksSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const sk = registry.sources.find((s) => s.id === 'skimlinks');
    assert.ok(sk);
    assert.equal(sk.enabled.live, false);
    assert.equal(sk.enabled.sandbox, false);
    assert.ok(sk.rateLimit);
    assert.equal(typeof sk.rateLimit.maxConcurrency, 'number');
    assert.ok(sk.rateLimit.maxConcurrency > 0);
    assert.equal(typeof sk.rateLimit.minIntervalMs, 'number');
    assert.ok(sk.rateLimit.minIntervalMs >= 0);
  });
});
