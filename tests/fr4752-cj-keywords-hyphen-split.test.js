'use strict';

/**
 * FR #4752: CJ counts hyphen-split parts as separate keywords.
 * `761-14` is two keywords; whitespace-only cap of 10 still 400s.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildProductsQuery,
  normalizeCjKeywordList,
  MAX_CJ_KEYWORDS,
  searchCj,
} = require('../providers/live/cj/src/search');

describe('FR #4752 CJ keywords count hyphen / non-alnum splits', () => {
  it('761-14 counts as two tokens toward the cap', () => {
    const out = normalizeCjKeywordList('VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner HobbyZone');
    assert.equal(out.length, 1);
    const tokens = out[0].split(/\s+/).filter(Boolean);
    assert.equal(tokens.length, MAX_CJ_KEYWORDS);
    assert.ok(!tokens.some((t) => t.includes('-')), 'hyphens must be split before send');
    assert.deepEqual(tokens.slice(0, 6), [
      'VOLANTEXRC',
      'Sport',
      'Cub',
      'S2',
      '761',
      '14',
    ]);
    // 11th CJ token (HobbyZone) dropped after hyphen expand
    assert.ok(!tokens.includes('HobbyZone'));
  });

  it('exact 10 space tokens with a hyphen still caps to 10 CJ tokens', () => {
    // 10 whitespace tokens; one hyphen makes 11 CJ tokens without this fix
    const ten =
      'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner HobbyZone';
    assert.equal(ten.split(/\s+/).length, 10);
    const payload = buildProductsQuery(ten, 'co-1', '99999');
    const joined = payload.variables.keywords.join(' ');
    const cjTokens = joined.split(/[^A-Za-z0-9]+/).filter(Boolean);
    assert.ok(cjTokens.length <= 10, `cjTokens=${cjTokens.length} ${joined}`);
  });

  it('array elements with hyphens are split before the global cap', () => {
    assert.deepEqual(normalizeCjKeywordList(['a-b', 'c-d', 'e']), [
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
  });

  it('searchCj body never exceeds 10 CJ-counted tokens', async () => {
    const q =
      'VOLANTEXRC Sport Cub S2 761-14 3CH RTF Xpilot beginner HobbyZone ExtraDrop';
    let parsed;
    await searchCj(
      { q, userId: 'U1', env: 'sandbox' },
      {
        env: {
          CJ_API_TOKEN: 'token-test',
          CJ_WEBSITE_ID: '88888',
        },
        httpRequest: async (req) => {
          parsed = JSON.parse(String(req.body || '{}'));
          return { data: { products: { resultList: [] } } };
        },
      },
    );
    const joined = parsed.variables.keywords.join(' ');
    const cjCount = joined.split(/[^A-Za-z0-9]+/).filter(Boolean).length;
    assert.ok(cjCount <= 10, `cjCount=${cjCount} joined=${joined}`);
  });
});
