'use strict';

/**
 * FR #4713: CJ GraphQL linkCode requires pid (website ID).
 * Live fatal: Field 'linkCode' argument 'pid' of type 'ID!' is required.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProductsQuery,
  assertCjCreds,
  searchCj,
  CjCredsError,
} = require('../providers/live/cj/src/search');

describe('FR #4713 CJ linkCode(pid) from CJ_WEBSITE_ID', () => {
  it('buildProductsQuery embeds linkCode(pid:) with website id', () => {
    const payload = buildProductsQuery('laptop', 'co-1', '99999');
    assert.match(payload.query, /linkCode\s*\(\s*pid:\s*"99999"\s*\)\s*\{\s*clickUrl\s*\}/);
    assert.equal(payload.variables.keywords, 'laptop');
    assert.match(payload.query, /\$keywords:\s*String!/);
  });

  it('assertCjCreds requires CJ_WEBSITE_ID for GraphQL linkCode', () => {
    assert.throws(
      () =>
        assertCjCreds({
          CJ_API_TOKEN: 'token-test',
          CJ_COMPANY_ID: 'co-1',
        }),
      (err) => {
        assert.ok(err instanceof CjCredsError || err.code === 'cj_missing_credentials');
        assert.match(String(err.message), /CJ_WEBSITE_ID/);
        return true;
      },
    );
  });

  it('searchCj HTTP body includes linkCode pid from env', async () => {
    let body;
    await searchCj(
      { q: 'shoes', userId: 'U1', env: 'sandbox' },
      {
        env: {
          CJ_API_TOKEN: 'token-test',
          CJ_WEBSITE_ID: '88888',
          CJ_COMPANY_ID: 'co-9',
        },
        httpRequest: async (req) => {
          body = String(req.body || '');
          return {
            data: {
              products: {
                resultList: [],
              },
            },
          };
        },
      },
    );
    assert.match(body, /linkCode\(pid: \\"88888\\"\)|linkCode\(pid: "88888"\)/);
  });
});
