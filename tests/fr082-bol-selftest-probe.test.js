'use strict';

/**
 * FR-082: bol selftestProbe + registry rateLimit (enabled FR-171).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  probeBolSelftest,
  bolSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/bol/src/selftestProbe');

const credEnv = {
  BOL_API_KEY: 'fixture-key',
  BOL_TRACKING_ID: 'track-test',
  A_SEARCH_ENV: 'sandbox',
};

describe('FR-082 bol selftestProbe + rateLimit', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.json required');
    let t = 0;
    const result = await probeBolSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'bol');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeBolSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'bol');
    assert.equal(result.error, 'bol_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeBolSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'GET');
        assert.match(String(req.url), /bol|catalog\/v4\/search|api\.bol/i);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('bolSelftestProbe rejects non-bol source', async () => {
    const result = await bolSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('registry rateLimit present; enabled stays false', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const bol = registry.sources.find((s) => s.id === 'bol');
    assert.ok(bol);
    assert.equal(bol.enabled.live, true);
    assert.equal(bol.enabled.sandbox, true);
    assert.ok(bol.rateLimit);
    assert.equal(typeof bol.rateLimit.maxConcurrency, 'number');
    assert.ok(bol.rateLimit.maxConcurrency > 0);
    assert.equal(typeof bol.rateLimit.minIntervalMs, 'number');
    assert.ok(bol.rateLimit.minIntervalMs >= 0);
  });
});
