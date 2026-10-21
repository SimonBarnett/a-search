'use strict';

/**
 * MRB #4792 hostile: FR #4781 — none never sent; all-excluded batch yields [];
 * multi-query fan-out still omits none.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  productSearchUrl,
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

describe('MRB #4792 hostile FR #4781', () => {
  it('searchRakuten never passes none even when productSearchUrl would accept it', async () => {
    // Low-level helper may still set none for unit tests; search path must not.
    const withNone = productSearchUrl('https://api.linksynergy.com/productsearch/1.0', {
      keyword: 'sofa',
      none: 'calendar',
      language: 'en_US',
    });
    assert.match(withNone, /none=calendar/);

    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        q: 'sofa',
        exclude: [{ match: 'title:calendar' }],
        userId: 'U1',
        env: 'sandbox',
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return {
            statusCode: 200,
            body: '<result><TotalMatches>0</TotalMatches></result>',
          };
        },
      },
    );
    assert.equal(urls.length, 1);
    assert.equal(new URL(urls[0]).searchParams.has('none'), false);
  });

  it('when every returned title matches exclude, result is []', async () => {
    resetRakutenTokenCache();
    const out = await searchRakuten(
      {
        q: 'sofa',
        exclude: ['calendar'],
        userId: 'U1',
        env: 'sandbox',
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          return {
            statusCode: 200,
            body:
              '<result><TotalMatches>2</TotalMatches>' +
              '<item><productid>a</productid><productname>Wall Calendar</productname><price>1</price></item>' +
              '<item><productid>b</productid><productname>Desk Calendar</productname><price>2</price></item>' +
              '</result>',
          };
        },
      },
    );
    assert.deepEqual(out, []);
  });

  it('multi-query fan-out omits none on every Product Search URL', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        queries: [{ q: 'sofa' }, { q: 'chair' }],
        exclude: ['calendar', 'boat as the product intent'],
        userId: 'U1',
        env: 'sandbox',
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return {
            statusCode: 200,
            body: '<result><TotalMatches>0</TotalMatches></result>',
          };
        },
      },
    );
    assert.equal(urls.length, 2);
    for (const raw of urls) {
      assert.equal(new URL(raw).searchParams.has('none'), false);
    }
  });
});
