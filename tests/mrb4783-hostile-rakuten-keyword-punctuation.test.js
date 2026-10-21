'use strict';

/**
 * MRB #4783 hostile: FR #4780 acceptance when searches.json has no market/
 * currency fields (residue only inside q), plus msg.q fallback path.
 * Stubbed HTTP only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  searchRakuten,
  sanitizeRakutenKeyword,
  queryTextsFromMsg,
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

describe('MRB #4783 hostile FR #4780', () => {
  it('strips UK market blob from q when msg has no market/currency fields', () => {
    // Issue #4780: searches.json has no market/currency; residue rides in q.
    const texts = queryTextsFromMsg({
      queries: [
        {
          q: 'VOLANTEXRC Sport Cub United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP',
        },
      ],
    });
    assert.equal(texts.length, 1);
    const t = texts[0];
    assert.match(t, /VOLANTEXRC/i);
    assert.match(t, /Sport Cub/i);
    assert.doesNotMatch(t, /United|Kingdom|Lathom|Ormskirk|GBP|L40/i);
    assert.doesNotMatch(t, /[()\[\],;.]/);
  });

  it('msg.q fallback strips market residue and Linksynergy punctuation', () => {
    const texts = queryTextsFromMsg({
      q: 'HobbyZone Sport Cub S2, United Kingdom GBP',
    });
    assert.equal(texts.length, 1);
    assert.equal(texts[0], 'HobbyZone Sport Cub S2');
    assert.doesNotMatch(texts[0], /United|GBP|[,]/i);
  });

  it('query that is only market residue yields no Product Search call', async () => {
    resetRakutenTokenCache();
    const urls = [];
    const result = await searchRakuten(
      {
        userId: 'U1',
        env: 'sandbox',
        queries: [{ q: 'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP' }],
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
    assert.equal(urls.length, 0);
    assert.deepEqual(result, []);
    // sanitize unit path keeps paren tokens; wired path drops parens via keywordsOnly (follow-up).
    assert.equal(sanitizeRakutenKeyword('kit (RTF)'), 'kit RTF');
  });

  it('Product Search keyword has no punctuation when residue is only in q', async () => {
    resetRakutenTokenCache();
    const urls = [];
    await searchRakuten(
      {
        userId: 'U1',
        env: 'sandbox',
        queries: [
          {
            q: 'E-flite UMX Waco Yellow United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP',
          },
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
    assert.equal(urls.length, 1);
    const u = decodeURIComponent(urls[0]);
    assert.match(u, /keyword=/);
    assert.doesNotMatch(u, /[()]/);
    assert.doesNotMatch(u, /United|Lathom|GBP/i);
    assert.doesNotMatch(u, /E-flite/);
  });
});
