'use strict';

/**
 * FR #4788: keywordsOnly must keep short product parentheticals (RTF/BNF)
 * while still dropping location blobs (Lathom, postcode, .co.uk).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { keywordsOnly } = require('../shared/search/cleanSearchQuery');
const {
  queryTextsFromMsg,
  sanitizeRakutenKeyword,
} = require('../providers/live/rakuten/src/search');

const MARKET = 'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk)';

describe('FR #4788 keep product parentheticals', () => {
  it('keywordsOnly keeps (RTF) and strips location blob', () => {
    const q = keywordsOnly(
      `HobbyZone Sport Cub S2 (RTF), ${MARKET} GBP`,
      '',
      '',
    );
    assert.match(q, /HobbyZone Sport Cub S2/i);
    assert.match(q, /\bRTF\b/);
    assert.doesNotMatch(q, /United|Lathom|Ormskirk|GBP|L40/i);
    assert.doesNotMatch(q, /[()]/);
  });

  it('keywordsOnly still drops location-only parentheticals', () => {
    const q = keywordsOnly(`trainer kits ${MARKET} GBP`, '', '');
    assert.equal(q, 'trainer kits');
  });

  it('queryTextsFromMsg keeps RTF after keywordsOnly + sanitize', () => {
    assert.equal(
      sanitizeRakutenKeyword('HobbyZone Sport Cub S2 (RTF)'),
      'HobbyZone Sport Cub S2 RTF',
    );
    const texts = queryTextsFromMsg({
      q: `HobbyZone Sport Cub S2 (RTF), ${MARKET} GBP`,
    });
    assert.equal(texts.length, 1);
    assert.equal(texts[0], 'HobbyZone Sport Cub S2 RTF');
  });

  it('queryTextsFromMsg still strips UK market residue without product parens', () => {
    const texts = queryTextsFromMsg({
      queries: [
        {
          q: `VOLANTEXRC Sport Cub ${MARKET} GBP`,
        },
      ],
    });
    assert.equal(texts.length, 1);
    assert.match(texts[0], /VOLANTEXRC/i);
    assert.doesNotMatch(texts[0], /United|Lathom|GBP/i);
  });
});
