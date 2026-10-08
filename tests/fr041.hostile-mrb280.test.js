'use strict';

/** MRB #280 hostile pins for FR-041 CJ GraphQL Product Search */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const cj = path.join(__dirname, '..', 'providers', 'live', 'cj');
const {
  run,
  EnvIsolationError,
} = require('../providers/live/cj/src/worker');
const { buildProductsQuery } = require('../providers/live/cj/src/search');

const baseMsg = {
  searchId: 'srch_h280',
  userId: 'U1',
  env: 'sandbox',
  source: 'cj',
  q: 'laptop',
  catalogId: 1,
  category: 'Electronics',
  subcategory: 'Computers',
};

describe('MRB #280 hostile: FR-041 cj GraphQL search', () => {
  it('skill pins ads.api.cj.com + writeResults path + Bearer token', () => {
    const text = fs.readFileSync(
      path.join(cj, '.grok', 'skills', 'a-search-cj', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /ads\.api\.cj\.com/i);
    assert.match(text, /writeResults|results path|S3_RESULTS_BUCKET/i);
    assert.match(text, /CJ_API_TOKEN|Bearer/i);
    assert.match(text, /assertWorkerEnv|env_mismatch|A_SEARCH_ENV/);
  });

  it('wrong-env msg → EnvIsolationError; no HTTP', async () => {
    let http = 0;
    await assert.rejects(
      () =>
        run(
          { ...baseMsg, env: 'live' },
          {
            env: {
              A_SEARCH_ENV: 'sandbox',
              CJ_API_TOKEN: 't',
              CJ_WEBSITE_ID: 'web-test',
              S3_RESULTS_BUCKET: 'b',
            },
            httpRequest: async () => {
              http += 1;
              throw new Error('should not call HTTP');
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) =>
        err instanceof EnvIsolationError ||
        err.name === 'EnvIsolationError' ||
        /env/i.test(String(err.message)),
    );
    assert.equal(http, 0);
  });

  it('GraphQL errors[] → thrown; companyId lands in query when set', async () => {
    const q = buildProductsQuery('shoes', 'CID-99');
    assert.match(q.query, /companyId:\s*"CID-99"/);
    assert.match(q.query, /ProductSearch|products/);
    assert.equal(q.variables.keywords, 'shoes');

    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            CJ_API_TOKEN: 't',
            CJ_COMPANY_ID: 'CID-99',
            CJ_WEBSITE_ID: 'web-test',
            S3_RESULTS_BUCKET: 'b',
          },
          httpRequest: async (req) => {
            assert.match(req.body, /CID-99/);
            return {
              errors: [{ message: 'Field unavailable' }],
            };
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.match(String(err.message), /GraphQL errors|Field unavailable/i);
        return true;
      },
    );
  });

  it('.env.example keeps CJ secrets in provider folder', () => {
    const envEx = fs.readFileSync(path.join(cj, '.env.example'), 'utf8');
    assert.match(envEx, /CJ_API_TOKEN/);
    assert.match(envEx, /CJ_GRAPHQL_URL/);
    assert.doesNotMatch(envEx, /sk_live_|eyJ[A-Za-z0-9_-]{10,}/);
  });
});