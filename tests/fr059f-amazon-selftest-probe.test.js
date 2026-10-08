'use strict';

/** FR-059f: amazon selftest probe — ok on fixture; false on missing creds */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeAmazonSelftest,
  amazonSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/amazon/src/selftestProbe');

const credEnv = {
  AMAZON_ACCESS_KEY: 'AKIATEST',
  AMAZON_SECRET_KEY: 'secret-test',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
};

describe('FR-059f amazon selftest probe', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'search-items-ok.json required');
    let t = 0;
    const result = await probeAmazonSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'amazon');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeAmazonSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'amazon');
    assert.equal(result.error, 'amazon_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeAmazonSelftest({
      env: credEnv,
      httpRequest: async (signed) => {
        calls.push(signed);
        assert.match(signed.url, /\/paapi5\/searchitems/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('amazonSelftestProbe rejects non-amazon source', async () => {
    const result = await amazonSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('selftestProbe module lives under providers/live/amazon', () => {
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'live',
      'amazon',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});
