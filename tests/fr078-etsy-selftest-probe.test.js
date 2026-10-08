'use strict';

/**
 * FR-078: etsy selftestProbe + registry rateLimit (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeEtsySelftest,
  etsySelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/etsy/src/selftestProbe');

const credEnv = {
  ETSY_API_KEY: 'fixture-key',
  ETSY_TRACKING_ID: 'track-test',
  A_SEARCH_ENV: 'sandbox',
};

describe('FR-078 etsy selftestProbe + rateLimit', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'listings-ok.json required');
    let t = 0;
    const result = await probeEtsySelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'etsy');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeEtsySelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'etsy');
    assert.equal(result.error, 'etsy_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeEtsySelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(String(req.url), /etsy|listings\/active|openapi/i);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('etsySelftestProbe rejects non-etsy source', async () => {
    const result = await etsySelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const et = registry.sources.find((s) => s.id === 'etsy');
    assert.ok(et);
    assert.equal(et.enabled.live, false);
    assert.equal(et.enabled.sandbox, false);
    assert.ok(et.rateLimit);
    assert.equal(typeof et.rateLimit.maxConcurrency, 'number');
    assert.ok(et.rateLimit.maxConcurrency > 0);
    assert.equal(typeof et.rateLimit.minIntervalMs, 'number');
    assert.ok(et.rateLimit.minIntervalMs >= 0);
  });
});
