'use strict';

/** FR-059i: cj selftest probe — ok on fixture; false on missing creds */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  probeCjSelftest,
  cjSelftestProbe,
  DEFAULT_FIXTURE,
} = require('../providers/live/cj/src/selftestProbe');

const credEnv = {
  CJ_API_TOKEN: 'token-test',
  CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
  CJ_COMPANY_ID: '123',
};

describe('FR-059i cj selftest probe', () => {
  it('ok true on recorded fixture when credentials present', async () => {
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'products-ok.json required');
    let t = 0;
    const result = await probeCjSelftest({
      env: credEnv,
      now: () => {
        const cur = t;
        t += 5;
        return cur;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'cj');
    assert.equal(result.latencyMs, 5);
    assert.equal(result.error, undefined);
  });

  it('ok false on missing credentials (no HTTP)', async () => {
    const httpCalls = [];
    const result = await probeCjSelftest({
      env: { A_SEARCH_ENV: 'sandbox' },
      httpRequest: async () => {
        httpCalls.push(1);
        throw new Error('should not call');
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'cj');
    assert.equal(result.error, 'cj_missing_credentials');
    assert.equal(httpCalls.length, 0);
  });

  it('ok true via injectable httpRequest returning fixture JSON', async () => {
    const fixture = JSON.parse(fs.readFileSync(DEFAULT_FIXTURE, 'utf8'));
    const calls = [];
    const result = await probeCjSelftest({
      env: credEnv,
      httpRequest: async (req) => {
        calls.push(req);
        assert.equal(req.method, 'POST');
        assert.match(String(req.url), /ads\.api\.cj\.com|query/);
        return fixture;
      },
    });
    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
  });

  it('cjSelftestProbe rejects non-cj source', async () => {
    const result = await cjSelftestProbe('amazon', { env: credEnv });
    assert.equal(result.ok, false);
    assert.equal(result.source, 'amazon');
    assert.equal(result.error, 'wrong_source');
  });

  it('selftestProbe module lives under providers/live/cj', () => {
    const p = path.join(
      __dirname,
      '..',
      'providers',
      'live',
      'cj',
      'src',
      'selftestProbe.js',
    );
    assert.ok(fs.existsSync(p));
  });
});
