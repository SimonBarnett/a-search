'use strict';

/**
 * FR-074: aliexpress selftestProbe + registry rateLimit (enabled FR-169).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeAliexpressSelftest,
  aliexpressSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/aliexpress/src/selftestProbe');

const credEnv = {
  ALIEXPRESS_API_KEY: 'fixture-key',
  ALIEXPRESS_TRACKING_ID: 'track-test',
  A_SEARCH_ENV: 'sandbox',
};

describe('FR-074 aliexpress selftestProbe + rateLimit', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.json required');
    let t = 0;
    const result = await probeAliexpressSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'aliexpress');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeAliexpressSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'aliexpress');
    assert.equal(result.error, 'aliexpress_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeAliexpressSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(String(req.url), /aliexpress|product\.query|affiliate/i);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('aliexpressSelftestProbe rejects non-aliexpress source', async () => {
    const result = await aliexpressSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const ae = registry.sources.find((s) => s.id === 'aliexpress');
    assert.ok(ae);
    assert.equal(ae.enabled.live, true);
    assert.equal(ae.enabled.sandbox, true);
    assert.ok(ae.rateLimit);
    assert.equal(typeof ae.rateLimit.maxConcurrency, 'number');
    assert.ok(ae.rateLimit.maxConcurrency > 0);
    assert.equal(typeof ae.rateLimit.minIntervalMs, 'number');
    assert.ok(ae.rateLimit.minIntervalMs >= 0);
  });
});
