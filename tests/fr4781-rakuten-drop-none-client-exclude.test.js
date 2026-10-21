'use strict';

/**
 * FR #4781: Linksynergy `none` (long worker-built strings) returns the whole
 * advertiser catalogue instead of narrowing. Drop `none`; filter excludes
 * client-side on product title. Genuine 0-match stays [].
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  productExcludedByTerms,
  excludeTermsFromMsg,
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

/** Minimal Product Search XML with one item. */
function itemXml(productid, productname) {
  return {
    statusCode: 200,
    body:
      '<result><TotalMatches>1</TotalMatches><item>' +
      `<productid>${productid}</productid>` +
      `<productname>${productname}</productname>` +
      '<price>9.99</price>' +
      '</item></result>',
  };
}

describe('FR #4781 Rakuten drop none; client-side exclude', () => {
  it('excludeTermsFromMsg keeps full phrases (no stopword flatten)', () => {
    const terms = excludeTermsFromMsg({
      exclude: [
        { match: 'title:calendar' },
        'boat as the product intent',
        'ab',
      ],
    });
    assert.deepEqual(terms, ['calendar', 'boat as the product intent']);
  });

  it('productExcludedByTerms matches phrase in title case-insensitively', () => {
    assert.equal(
      productExcludedByTerms({ title: 'Wall Calendar 2026' }, ['calendar']),
      true,
    );
    assert.equal(
      productExcludedByTerms({ title: 'Blue Sofa' }, ['calendar']),
      false,
    );
    assert.equal(
      productExcludedByTerms(
        { title: 'Guide: boat as the product intent kit' },
        ['boat as the product intent'],
      ),
      true,
    );
  });

  it('searchRakuten never puts none on Product Search URL', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        q: 'sofa',
        userId: 'U-4781',
        env: 'sandbox',
        exclude: [
          { match: 'title:calendar' },
          'boat as the product intent',
          'night-flying features',
        ],
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return itemXml('p1', 'Grey Sofa Bed');
        },
      },
    );
    assert.equal(urls.length, 1);
    const u = new URL(urls[0]);
    assert.equal(u.searchParams.has('none'), false, 'none must not be sent');
    assert.equal(u.searchParams.get('keyword'), 'sofa');
  });

  it('client-side exclude drops matching titles; keeps others', async () => {
    resetRakutenTokenCache();
    let n = 0;
    const out = await searchRakuten(
      {
        q: 'sofa',
        userId: 'U-4781',
        env: 'sandbox',
        exclude: [{ match: 'title:calendar' }],
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          n += 1;
          // Return two items in one response via two sequential calls if needed;
          // single XML with two items.
          return {
            statusCode: 200,
            body:
              '<result><TotalMatches>2</TotalMatches>' +
              '<item><productid>keep1</productid><productname>Grey Sofa</productname><price>1</price></item>' +
              '<item><productid>drop1</productid><productname>Desk Calendar Pack</productname><price>2</price></item>' +
              '</result>',
          };
        },
      },
    );
    assert.equal(n, 1);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'keep1');
    assert.match(String(out[0].title), /Grey Sofa/i);
  });

  it('0-match keyword with excludes still returns [] (no catalogue inject)', async () => {
    resetRakutenTokenCache();
    const out = await searchRakuten(
      {
        q: 'VOLANTEXRC Sport Cub S2',
        userId: 'U-4781',
        env: 'sandbox',
        exclude: [{ match: 'title:calendar' }, 'test courses'],
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          return {
            statusCode: 200,
            body: '<result><TotalMatches>0</TotalMatches></result>',
          };
        },
      },
    );
    assert.deepEqual(out, []);
  });
});
