'use strict';

/**
 * Hostile pin MRB #4770 / FR #4769: Rakuten INVALID_CONTEXT must not write
 * status IN --- fail into DLQ (no silent empty, no status IN).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { run } = require('../providers/live/rakuten/src/worker');
const {
  searchRakuten,
  resetRakutenTokenCache,
} = require('../providers/live/rakuten/src/search');

const env = {
  RAKUTEN_CLIENT_ID: 'FAKE_rakuten_id',
  RAKUTEN_CLIENT_SECRET: 'FAKE_rakuten_secret',
  RAKUTEN_SID: 'FAKE_sid',
  A_SEARCH_ENV: 'sandbox',
};

describe('docs/mrb-4770 Rakuten invalid_context -> DLQ (FR #4769)', () => {
  it('worker throws and does not write IN on rakuten_invalid_context', async () => {
    const puts = [];
    await assert.rejects(
      () =>
        run(
          {
            searchId: 'srch_mrb4770',
            searchid: 'srch_mrb4770',
            userId: 'U1',
            env: 'sandbox',
            hostkey: 'club.example',
            guid: 'guid-mrb',
            q: 'shoes',
          },
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

  it('searchRakuten still fans out and sanitizes hyphens (FR #4768 core)', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        userId: 'U1',
        env: 'sandbox',
        queries: [{ q: 'bed 761-14' }, { q: 'sofa' }],
      },
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
          urls.push(String(req.url || ''));
          return {
            statusCode: 200,
            body: '<result><TotalMatches>0</TotalMatches></result>',
          };
        },
      },
    );
    assert.equal(urls.length, 2);
    const kw0 = new URL(urls[0]).searchParams.get('keyword') || '';
    assert.doesNotMatch(kw0, /761-14/);
    assert.match(kw0, /761\s+14/);
  });

  it('worker source has no status-IN catch for invalid_context', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'providers/live/rakuten/src/worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /skipped:\s*'rakuten_invalid_context'/);
    assert.doesNotMatch(src, /writeLiveProviderInResult\(\{[\s\S]*status,/);
  });

  it('this pin file ends with a trailing newline', () => {
    const self = fs.readFileSync(__filename);
    assert.ok(self.length > 0 && self[self.length - 1] === 0x0a);
  });
});
