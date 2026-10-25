'use strict';

/**
 * FR #5057: CDK assert requires CJ company + website ids; 403 with companyId
 * retries once omitting companyId; stale "do not DLQ" comment is gone.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  requiredBundledEnvKeys,
} = require('../cdk/lib/provider-env-assert');
const { searchCj } = require('../providers/live/cj/src/search');

const SEARCH = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'cj',
  'src',
  'search.js',
);
const ASSERT = path.join(
  __dirname,
  '..',
  'cdk',
  'lib',
  'provider-env-assert.js',
);

const fixturePath = path.join(
  __dirname,
  '..',
  'providers',
  'live',
  'cj',
  'fixtures',
  'products-ok.json',
);

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  CJ_API_TOKEN: 'FAKE_CJ_TOKEN',
  CJ_COMPANY_ID: 'co-mismatch',
  CJ_WEBSITE_ID: '12345',
  CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
};

describe('FR #5057 CJ env assert + 403 company omit', () => {
  it('requiredBundledEnvKeys(cj) matches stack: token, company, website', () => {
    const keys = requiredBundledEnvKeys('cj');
    assert.deepEqual(keys.sort(), [
      'CJ_API_TOKEN',
      'CJ_COMPANY_ID',
      'CJ_WEBSITE_ID',
    ].sort());
    const src = fs.readFileSync(ASSERT, 'utf8');
    assert.match(src, /CJ_COMPANY_ID/);
    assert.match(src, /CJ_WEBSITE_ID/);
  });

  it('search.js comment cites FR #4782 DLQ (not do not DLQ)', () => {
    const src = fs.readFileSync(SEARCH, 'utf8');
    assert.match(src, /FR #4782/);
    assert.match(src, /provider DLQ/);
    assert.doesNotMatch(src, /do not DLQ \/ intake-fatal/);
  });

  it('403 with companyId then 200 without companyId returns products', async () => {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const bodies = [];
    const rows = await searchCj(
      { q: 'servo', userId: 'U1', env: 'sandbox', searchId: 's1' },
      {
        env: credEnv,
        httpRequest: async (req) => {
          bodies.push(String(req.body));
          if (String(req.body).includes('companyId')) {
            const err = new Error('CJ HTTP non-JSON 403: You are not Authorised');
            err.statusCode = 403;
            err.code = 'cj_not_authorised';
            err.nonRetryable = true;
            throw err;
          }
          return fixture;
        },
      },
    );
    assert.equal(bodies.length, 2);
    assert.match(bodies[0], /companyId/);
    assert.doesNotMatch(bodies[1], /companyId/);
    assert.ok(rows.length > 0);
  });

  it('403 without companyId does not retry', async () => {
    let n = 0;
    await assert.rejects(
      () =>
        searchCj(
          { q: 'servo', userId: 'U1', env: 'sandbox' },
          {
            env: {
              CJ_API_TOKEN: 'FAKE_CJ_TOKEN',
              CJ_WEBSITE_ID: '12345',
            },
            httpRequest: async () => {
              n += 1;
              const err = new Error('CJ HTTP non-JSON 403: You are not Authorised');
              err.statusCode = 403;
              err.code = 'cj_not_authorised';
              err.nonRetryable = true;
              throw err;
            },
          },
        ),
      (err) => err.code === 'cj_not_authorised',
    );
    assert.equal(n, 1);
  });
});
