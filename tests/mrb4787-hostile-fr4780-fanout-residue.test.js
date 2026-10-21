'use strict';

/**
 * MRB #4787 hostile pin (FR #4780): multi-query fan-out skips residue-only
 * queries and never puts punctuation/market blobs on Product Search URLs.
 * Stubbed HTTP only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

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

function tokenOk() {
  return {
    statusCode: 200,
    body: JSON.stringify({ access_token: 'FAKE_access_token', expires_in: 3600 }),
  };
}

function emptyXml() {
  return { statusCode: 200, body: '<result><TotalMatches>0</TotalMatches></result>' };
}

describe('MRB #4787 hostile FR #4780 fan-out residue', () => {
  it('mixed queries: residue-only skipped; product keyword sanitized', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        userId: 'U-4787',
        env: 'sandbox',
        queries: [
          { q: 'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP' },
          { q: 'HobbyZone Sport Cub S2 (RTF), United Kingdom GBP' },
          { q: 'bed, chair; table.' },
        ],
      },
      {
        env,
        httpRequest: async (req) => {
          if (String(req.url || '').includes('/token')) return tokenOk();
          urls.push(String(req.url || ''));
          return emptyXml();
        },
      },
    );
    assert.equal(urls.length, 2, 'residue-only query must not call Product Search');
    const keywords = urls.map((u) => new URL(u).searchParams.get('keyword') || '');
    assert.ok(keywords.some((k) => /HobbyZone/i.test(k)));
    assert.ok(keywords.some((k) => /bed/i.test(k) && /chair/i.test(k)));
    for (const k of keywords) {
      assert.doesNotMatch(k, /[()\[\],;.]/);
      assert.doesNotMatch(k, /United|Kingdom|Lathom|GBP/i);
    }
  });
});
