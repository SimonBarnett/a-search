'use strict';

/**
 * FR #4740: CJ GraphQL products.keywords expects [String!], not String!.
 * Live fatal: Variable '$keywords' of type 'String!' used in position expecting type '[String!]'.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProductsQuery,
  searchCj,
} = require('../providers/live/cj/src/search');

describe('FR #4740 CJ keywords GraphQL [String!]', () => {
  it('buildProductsQuery declares $keywords as [String!]! and sends an array', () => {
    const payload = buildProductsQuery('laptop bag', 'co-1', '99999');
    assert.match(payload.query, /\$keywords:\s*\[String!\]!/);
    assert.doesNotMatch(payload.query, /\$keywords:\s*String!/);
    assert.ok(Array.isArray(payload.variables.keywords));
    assert.deepEqual(payload.variables.keywords, ['laptop bag']);
  });

  it('buildProductsQuery accepts a keywords array without nesting again', () => {
    const payload = buildProductsQuery(['red', 'shoes'], 'co-1', '99999');
    assert.deepEqual(payload.variables.keywords, ['red', 'shoes']);
  });

  it('searchCj HTTP variables.keywords is a non-empty string array', async () => {
    let parsed;
    await searchCj(
      { q: 'hiking boots', userId: 'U1', env: 'sandbox' },
      {
        env: {
          CJ_API_TOKEN: 'token-test',
          CJ_WEBSITE_ID: '88888',
          CJ_COMPANY_ID: 'co-9',
        },
        httpRequest: async (req) => {
          parsed = JSON.parse(String(req.body || '{}'));
          return { data: { products: { resultList: [] } } };
        },
      },
    );
    assert.match(parsed.query, /\$keywords:\s*\[String!\]!/);
    assert.ok(Array.isArray(parsed.variables.keywords));
    assert.ok(parsed.variables.keywords.length >= 1);
    assert.equal(typeof parsed.variables.keywords[0], 'string');
  });
});
