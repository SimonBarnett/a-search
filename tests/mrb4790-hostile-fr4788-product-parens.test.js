'use strict';

/**
 * MRB #4790 hostile pins for FR #4788: short product parentheticals survive
 * keywordsOnly + Rakuten sanitize into Product Search keyword.
 * Stubbed HTTP only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { keywordsOnly } = require('../shared/search/cleanSearchQuery');
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

describe('MRB #4790 hostile FR #4788 product parentheticals', () => {
  it('keywordsOnly keeps BNF/PNP/kit; drops unknown long paren', () => {
    assert.match(keywordsOnly('wing (BNF) pack', '', ''), /\bBNF\b/);
    assert.match(keywordsOnly('motor (PNP)', '', ''), /\bPNP\b/);
    assert.match(keywordsOnly('airframe (kit)', '', ''), /\bkit\b/);
    const long = keywordsOnly('servo (extra long marketing phrase here)', '', '');
    assert.equal(long, 'servo');
  });

  it('Product Search keyword includes RTF when q has (RTF) + UK blob', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        userId: 'U-4790',
        env: 'sandbox',
        q: 'HobbyZone Sport Cub S2 (RTF), United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP',
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
    assert.equal(urls.length, 1);
    const kw = new URL(urls[0]).searchParams.get('keyword') || '';
    assert.match(kw, /HobbyZone/i);
    assert.match(kw, /\bRTF\b/);
    assert.doesNotMatch(kw, /[()]/);
    assert.doesNotMatch(kw, /United|Lathom|GBP/i);
  });
});
