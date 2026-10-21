'use strict';

/**
 * FR #4768: Rakuten silent empty IN --- hyphenated keywords, multi-word none,
 * and AND-joined queries. Stubbed HTTP only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  sanitizeRakutenKeyword,
  excludeTermsFromMsg,
  resetRakutenTokenCache,
} = require('../providers/live/rakuten/src/search');
const { run } = require('../providers/live/rakuten/src/worker');

const env = {
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
  A_SEARCH_ENV: 'sandbox',
};

function tokenOk() {
  return {
    statusCode: 200,
    body: JSON.stringify({ access_token: 'FAKE_access_token', expires_in: 3600 }),
  };
}

function emptyXml() {
  return { statusCode: 200, body: '<result><TotalMatches>0</TotalMatches></result>' };
}

describe('FR #4768 Rakuten keyword fan-out / none / status', () => {
  it('sanitizeRakutenKeyword never leaves raw a-b tokens', () => {
    assert.equal(sanitizeRakutenKeyword('bed 761-14'), 'bed 761 14');
    assert.equal(sanitizeRakutenKeyword('E-flite UMX'), 'E flite UMX');
    assert.doesNotMatch(sanitizeRakutenKeyword('VOLANTEXRC Sport Cub S2 761-14'), /\d-\d/);
  });

  it('excludeTermsFromMsg keeps full phrases; drops short tokens (FR #4781)', () => {
    // FR #4781 superseded stopword-flatten `none`: keep phrases for client filter.
    const terms = excludeTermsFromMsg({
      exclude: [
        { match: 'title:calendar' },
        'boat as the product intent',
        'BMFA A or B test courses',
        'x',
        'ab',
      ],
    });
    assert.ok(terms.includes('calendar'));
    assert.ok(terms.includes('boat as the product intent'));
    assert.ok(terms.includes('BMFA A or B test courses'));
    assert.ok(!terms.includes('x'));
    assert.ok(!terms.includes('ab'));
  });

  it('hyphenated query never reaches the Product Search URL raw', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      { q: 'bed 761-14', userId: 'U1', env: 'sandbox' },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return emptyXml();
        },
      },
    );
    assert.equal(urls.length, 1);
    const u = new URL(urls[0]);
    const kw = u.searchParams.get('keyword') || '';
    assert.doesNotMatch(kw, /761-14/);
    assert.match(kw, /761\s+14/);
  });

  it('multi-query msg makes one Product Search call per query', async () => {
    resetRakutenTokenCache();
    const productUrls = [];
    await searchRakuten(
      {
        userId: 'U1',
        env: 'sandbox',
        queries: [{ q: 'sofa' }, { q: 'bed' }, { q: 'chair' }],
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          productUrls.push(String(req.url || ''));
          return emptyXml();
        },
      },
    );
    assert.equal(productUrls.length, 3);
    const keywords = productUrls.map((u) => new URL(u).searchParams.get('keyword'));
    assert.deepEqual(keywords, ['sofa', 'bed', 'chair']);
  });

  it('INVALID_CONTEXT throws (FR #4769 DLQ; not silent empty or status IN)', async () => {
    resetRakutenTokenCache();
    const puts = [];
    await assert.rejects(
      () =>
        run(
          {
            searchId: 'srch_4768',
            searchid: 'srch_4768',
            userId: 'U1',
            env: 'sandbox',
            hostkey: 'club.example',
            guid: 'guid-4768',
            q: 'shoes',
          },
          {
            env,
            httpRequest: async (req) => {
              if (String(req.url || '').includes('/token')) return tokenOk();
              const err = new Error(
                'Rakuten HTTP 400: <ErrorID>INVALID_CONTEXT_VALUE</ErrorID>',
              );
              err.statusCode = 400;
              err.code = 'rakuten_invalid_context';
              throw err;
            },
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
            touchLastmod: async () => {},
          },
        ),
      (e) => e && e.code === 'rakuten_invalid_context',
    );
    assert.equal(puts.length, 0);
  });
});
