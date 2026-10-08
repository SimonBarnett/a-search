'use strict';

/** FR-059h: rakuten selftest probe — ok on fixture; false on missing creds */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeRakutenSelftest,
  rakutenSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/rakuten/src/selftestProbe');

const credEnv = {
  RAKUTEN_APPLICATION_KEY: 'app-key-test',
  RAKUTEN_AFFILIATE_ID: 'aff-test',
  RAKUTEN_ENDPOINT: 'https://api.rakuten.com/',
};

describe('FR-059h rakuten selftest probe', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'product-search-ok.xml required');
    let t = 0;
    const result = await probeRakutenSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'rakuten');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeRakutenSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'rakuten');
    assert.equal(result.error, 'rakuten_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture XML', async () => {
    const fixture = fs.readFileSync(DEFAULT_FIXTURE, 'utf8');
    const calls = [];
    const result = await probeRakutenSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.match(String(req.url), /productsearch/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('rakutenSelftestProbe rejects non-rakuten source', async () => {
    const result = await rakutenSelftestProbe('ebay', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'ebay');
    assert.equal(result.error, 'wrong_source');
  });

  it('selftestProbe module lives under providers/live/rakuten', () => {
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'live',
      'rakuten',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});
