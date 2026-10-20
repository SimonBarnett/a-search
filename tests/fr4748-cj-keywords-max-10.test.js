'use strict';

/**
 * FR #4748: CJ HTTP 400 "Too many keywords. Please limit keywords to 10 or fewer".
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProductsQuery,
  normalizeCjKeywordList,
  MAX_CJ_KEYWORDS,
  searchCj,
} = require('../providers/live/cj/src/search');

describe('FR #4748 CJ keywords max 10', () => {
  it('MAX_CJ_KEYWORDS is 10', () => {
    assert.equal(MAX_CJ_KEYWORDS, 10);
  });

  it('string with many words is truncated to 10 tokens (still one array element)', () => {
    const words = Array.from({ length: 15 }, (_, i) => `w${i + 1}`);
    const payload = buildProductsQuery(words.join(' '), 'co-1', '99999');
    assert.ok(Array.isArray(payload.variables.keywords));
    assert.equal(payload.variables.keywords.length, 1);
    const tokens = payload.variables.keywords[0].split(/\s+/);
    assert.equal(tokens.length, 10);
    assert.deepEqual(tokens, words.slice(0, 10));
  });

  it('array longer than 10 is capped', () => {
    const many = Array.from({ length: 12 }, (_, i) => `k${i + 1}`);
    assert.deepEqual(normalizeCjKeywordList(many), many.slice(0, 10));
  });

  it('short multi-word string stays one element (FR #4740 shape)', () => {
    const payload = buildProductsQuery('laptop bag', 'co-1', '99999');
    assert.deepEqual(payload.variables.keywords, ['laptop bag']);
  });

  it('searchCj never sends more than 10 keyword tokens', async () => {
    const longQ = Array.from({ length: 20 }, (_, i) => `term${i}`).join(' ');
    let parsed;
    await searchCj(
      { q: longQ, userId: 'U1', env: 'sandbox' },
      {
        env: {
          CJ_API_TOKEN: 'token-test',
          CJ_WEBSITE_ID: '88888',
        },
        httpRequest: async (req) => {
          parsed = JSON.parse(String(req.body || '{}'));
          return { data: { products: { resultList: [] } } };
        },
      },
    );
    const kw = parsed.variables.keywords;
    assert.ok(Array.isArray(kw));
    const tokenCount = kw
      .join(' ')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean).length;
    assert.ok(tokenCount <= 10, `tokenCount=${tokenCount}`);
  });
});
