'use strict';

/**
 * FR #4849: entry /selftest ebay@sandbox filed ebay_missing_credentials because
 * the default fixture probe required EBAY_* on the entry Lambda (S2: entry
 * does not hold provider secrets). Fixture-only probes must not require creds.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { probeEbaySelftest } = require('../providers/live/ebay/src/selftestProbe');
const { reportSelftestFailure } = require('../shared/selftest/reportSelftestFailure');

describe('FR #4849 ebay sandbox fixture selftest', () => {
  it('fixture-only probe is ok without EBAY_* (entry Lambda env)', async () => {
    const result = await probeEbaySelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, undefined);
  });

  it('HTTP probe still fails closed without creds and does not call vendor', async () => {
    const httpCalls = [];
    const result = await probeEbaySelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ebay_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('missing_credentials intake title stays deduped (no secrets)', async () => {
    const posts = [];
    await reportSelftestFailure({
      provider: 'ebay',
      env: 'sandbox',
      error: 'ebay_missing_credentials',
      latencyMs: 1,
      reportException: async (opts) => {
        posts.push(opts);
        return { filed: true };
      },
    });
    assert.equal(posts.length, 1);
    assert.match(posts[0].title, /ebay @ sandbox/);
    assert.doesNotMatch(JSON.stringify(posts[0]), /EBAY_CLIENT|secret-test/i);
  });
});
