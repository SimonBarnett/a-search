'use strict';

/**
 * FR #4318: market and currency stay off q; short exclude tokens are not substrings.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchesDoc } = require('../redqueen/src/guidSearch');
const { isExcluded } = require('../shared/widgets/agentIngest');

const MARKET = 'United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk)';

describe('FR #4318 query keywords and whole-word exclude', () => {
  it('keeps market, currency and postcode out of q and sends them beside it', () => {
    const { doc } = buildSearchesDoc({
      review: {
        suggestedQueries: [
          `trainer kits ${MARKET} GBP`,
          'balsa L40 4BA',
        ],
      },
      steering: {
        market: MARKET,
        currency: 'GBP',
        exclude: ['IC', 'glow engine', 'x'],
      },
      existing: { queries: [], exclude: [] },
      now: '2026-10-18T12:00:00.000Z',
    });
    for (const row of doc.queries) {
      assert.equal(row.q.includes('United Kingdom'), false);
      assert.equal(row.q.includes('L40'), false);
      assert.equal(/\bGBP\b/.test(row.q), false);
    }
    assert.equal(doc.queries[0].q, 'trainer kits');
    assert.equal(doc.queries[1].q, 'balsa');
    // FR #4563: long UK steering market normalises to GB
    assert.equal(doc.market, 'GB');
    assert.equal(doc.currency, 'GBP');
    assert.equal(doc.exclude.some((e) => String(e.match).toLowerCase() === 'ic'), false);
    assert.equal(doc.exclude.some((e) => e.match === 'glow engine'), true);
    assert.equal(doc.exclude.some((e) => e.match === 'x'), false);
  });

  it('IC does not exclude electric or classic; a whole word still does', () => {
    const exclude = [
      { match: 'IC', reason: 'steering', at: 't' },
      { match: 'glow', reason: 'steering', at: 't' },
    ];
    assert.equal(isExcluded({ partNumber: '1', title: 'electric motor' }, exclude), false);
    assert.equal(isExcluded({ partNumber: '2', title: 'classic kit' }, exclude), false);
    assert.equal(isExcluded({ partNumber: '3', title: 'Glow engine mount' }, exclude), true);
    assert.equal(isExcluded({ partNumber: '4', title: 'glowing film' }, exclude), false);
  });
});
