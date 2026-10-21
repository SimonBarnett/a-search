'use strict';

/**
 * FR #4780: after #4768, Linksynergy still 400 INVALID_CONTEXT_VALUE when
 * keyword carries ( ) , ; . or market/location/currency residue.
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

describe('FR #4780 Rakuten keyword punctuation + market strip', () => {
  it('sanitizeRakutenKeyword strips ( ) , ; . and hyphens', () => {
    assert.equal(
      sanitizeRakutenKeyword('HobbyZone Sport Cub S2 (RTF)'),
      'HobbyZone Sport Cub S2 RTF',
    );
    assert.equal(
      sanitizeRakutenKeyword('bed, chair; table.'),
      'bed chair table',
    );
    assert.doesNotMatch(sanitizeRakutenKeyword('761-14 (kit)'), /[()\-,;.]/);
  });

  it('queryTextsFromMsg drops market/location/currency residue', () => {
    const texts = queryTextsFromMsg({
      queries: [
        {
          q: 'VOLANTEXRC Sport Cub United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP',
        },
      ],
      market: 'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk)',
      currency: 'GBP',
    });
    assert.equal(texts.length, 1);
    const t = texts[0];
    assert.match(t, /VOLANTEXRC/i);
    assert.match(t, /Sport Cub/i);
    assert.doesNotMatch(t, /United/i);
    assert.doesNotMatch(t, /Kingdom/i);
    assert.doesNotMatch(t, /Lathom/i);
    assert.doesNotMatch(t, /Ormskirk/i);
    assert.doesNotMatch(t, /GBP/i);
    assert.doesNotMatch(t, /[()\[\],;.]/);
  });

  it('Product Search URL never carries punctuation or UK market blob', async () => {
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
    assert.doesNotMatch(u, /United/i);
    assert.doesNotMatch(u, /Lathom/i);
    assert.doesNotMatch(u, /GBP/i);
    assert.doesNotMatch(u, /E-flite/);
    assert.match(u, /E\+flite|E flite|E%20flite|keyword=E/i);
  });
});
