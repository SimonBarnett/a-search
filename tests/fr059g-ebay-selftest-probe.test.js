'use strict';

/** FR-059g: ebay selftest probe — ok on fixture; false on missing creds */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeEbaySelftest,
  ebaySelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/ebay/src/selftestProbe');

const credEnv = {
  EBAY_CLIENT_ID: 'client-test',
  EBAY_CLIENT_SECRET: 'secret-test',
  EBAY_MARKETPLACE_ID: 'EBAY_GB',
  EBAY_ENV: 'sandbox',
};

describe('FR-059g ebay selftest probe', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'item-summary-ok.json required');
    let t = 0;
    const result = await probeEbaySelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'ebay');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeEbaySelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'ebay_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeEbaySelftest({
      env: credEnv,
      accessToken: 'token-test',
      httpRequest: async (req) => {
        calls.push(req);
        assert.match(String(req.url), /item_summary\/search/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('ebaySelftestProbe rejects non-ebay source', async () => {
    const result = await ebaySelftestProbe('amazon', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'amazon');
    assert.equal(result.error, 'wrong_source');
  });

  it('selftestProbe module lives under providers/live/ebay', () => {
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'live',
      'ebay',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});
