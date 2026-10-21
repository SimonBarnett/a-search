'use strict';

/**
 * MRB #4795 hostile pin (FR #4781): buildRakutenNone is empty; phrase exclude
 * filters titles without sending none.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  buildRakutenNone,
  resetRakutenTokenCache,
} = require('../providers/live/rakuten/src/search');

const env = {
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
};

function tokenOk() {
  return {
    statusCode: 200,
    body: JSON.stringify({ access_token: 'FAKE_access_token', expires_in: 3600 }),
  };
}

describe('MRB #4795 hostile FR #4781 drop none', () => {
  it('buildRakutenNone always empty (deprecated; none never sent)', () => {
    assert.equal(
      buildRakutenNone({
        exclude: [{ match: 'title:calendar' }, 'boat as the product intent'],
      }),
      '',
    );
  });

  it('phrase exclude drops matching title; keeps non-match; no none on URL', async () => {
    resetRakutenTokenCache();
    const urls = [];
    const out = await searchRakuten(
      {
        q: 'kit',
        exclude: ['boat as the product intent'],
        userId: 'U-4795',
        env: 'sandbox',
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return {
            statusCode: 200,
            body:
              '<result><TotalMatches>2</TotalMatches>' +
              '<item><productid>keep</productid><productname>Trainer Kit</productname><price>1</price></item>' +
              '<item><productid>drop</productid><productname>Guide boat as the product intent</productname><price>2</price></item>' +
              '</result>',
          };
        },
      },
    );
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0]).searchParams.has('none'), false);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'keep');
  });
});
