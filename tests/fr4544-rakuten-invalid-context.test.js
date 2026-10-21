'use strict';

/**
 * FR #4544: Rakuten Product Search INVALID_CONTEXT_VALUE.
 * Do not put Lucene-style -exclude into keyword; use the API `none` param.
 * On INVALID_CONTEXT_VALUE, search throws; worker writes status IN (FR #4768).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  productSearchUrl,
  resetRakutenTokenCache,
} = require('../providers/live/rakuten/src/search');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

const env = {
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
};

describe('FR #4544 Rakuten INVALID_CONTEXT_VALUE', () => {
  it('productSearchUrl puts excludes in none and sets language; keyword has no minus', () => {
    const url = productSearchUrl(
      'https://api.linksynergy.com/productsearch/1.0',
      {
        keyword: 'model aircraft servo',
        none: 'calendar',
        language: 'en_US',
        max: 10,
      },
    );
    const u = new URL(url);
    assert.equal(u.searchParams.get('keyword'), 'model aircraft servo');
    assert.equal(u.searchParams.get('none'), 'calendar');
    assert.equal(u.searchParams.get('language'), 'en_US');
    assert.equal(u.searchParams.get('max'), '10');
    assert.doesNotMatch(u.search, /-calendar/);
  });

  it('searchRakuten sends none for agent exclude and does not put -term in keyword', async () => {
    resetRakutenTokenCache();
    const calls = [];
    await searchRakuten(
      {
        userId: 'U-4544',
        env: 'live',
        queries: [{ q: 'model aircraft' }, 'servo'],
        exclude: [{ match: 'title:calendar' }],
      },
      {
        env,
        httpRequest: async (req) => {
          calls.push(req);
          if (String(req.url || '').includes('/token')) {
            return {
              statusCode: 200,
              body: JSON.stringify({
                access_token: 'FAKE_access_token',
                expires_in: 3600,
              }),
            };
          }
          return { statusCode: 200, body: '<result></result>' };
        },
      },
    );
    // FR #4768: one Product Search call per query (+ token) = 3 calls.
    assert.equal(calls.length, 3);
    const productCalls = calls.filter((c) => !String(c.url || '').includes('/token'));
    assert.equal(productCalls.length, 2);
    const keywords = productCalls
      .map((c) => new URL(c.url).searchParams.get('keyword'))
      .sort();
    assert.deepEqual(keywords, ['model aircraft', 'servo']);
    for (const c of productCalls) {
      const u = new URL(c.url);
      assert.equal(u.searchParams.get('none'), 'calendar');
      assert.equal(u.searchParams.get('language'), 'en_US');
      assert.doesNotMatch(u.searchParams.get('keyword') || '', /-/);
    }
  });

  it('INVALID_CONTEXT_VALUE HTTP 400 throws for worker status IN; SQS does not file intake', async () => {
    resetRakutenTokenCache();
    const reports = [];
    await assert.rejects(
      () =>
        searchRakuten(
          { q: 'shoes', userId: 'U-4544', env: 'live' },
          {
            env,
            httpRequest: async (req) => {
              if (String(req.url || '').includes('/token')) {
                return {
                  statusCode: 200,
                  body: JSON.stringify({
                    access_token: 'FAKE_access_token',
                    expires_in: 3600,
                  }),
                };
              }
              const err = new Error(
                'Rakuten HTTP 400: <result><Errors><ErrorID>INVALID_CONTEXT_VALUE</ErrorID><ErrorText>cannot resolve value from request</ErrorText></Errors></result>',
              );
              err.statusCode = 400;
              err.code = 'rakuten_invalid_context';
              throw err;
            },
          },
        ),
      (err) => err && err.code === 'rakuten_invalid_context',
    );

    // Handler path: invalid_context must not reportException (class of FR #4438).
    const { run } = require('../providers/live/rakuten/src/worker');
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 'srch_4544',
              searchid: 'srch_4544',
              userId: 'U-4544',
              env: 'sandbox',
              hostkey: 'club.example',
              guid: 'guid-4544',
              q: 'shoes',
            }),
            receiptHandle: 'rh-4544',
          },
        ],
      },
      run: async (msg, deps) =>
        run(msg, {
          ...deps,
          env: { ...env, A_SEARCH_ENV: 'sandbox' },
          httpRequest: async (req) => {
            if (String(req.url || '').includes('/token')) {
              return {
                statusCode: 200,
                body: JSON.stringify({
                  access_token: 'FAKE_access_token',
                  expires_in: 3600,
                }),
              };
            }
            const err = new Error(
              'Rakuten HTTP 400: <result><Errors><ErrorID>INVALID_CONTEXT_VALUE</ErrorID></result>',
            );
            err.statusCode = 400;
            throw err;
          },
          putObject: async () => ({}),
          touchLastmod: async () => {},
        }),
      reportException: async (opts) => {
        reports.push(opts);
      },
      route: 'providers/live/rakuten/handler',
      source: 'rakuten',
    });
    assert.equal(reports.length, 0);
    assert.equal(out.ok, true);
  });
});
