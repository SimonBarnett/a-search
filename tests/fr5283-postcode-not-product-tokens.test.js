'use strict';

/**
 * FR #5283: UK postcode cleaner must not eat product tokens (S2 3CH).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  keywordsOnly,
  stripContextualUkPostcodes,
} = require('../shared/search/cleanSearchQuery');
const { buildSearchesDoc, cleanSearchesQueries } = require('../redqueen/src/guidSearch');

describe('FR #5283 postcode cleaner keeps product tokens', () => {
  it('keeps S2 3CH on the VOLANTEXRC example', () => {
    const q = keywordsOnly(
      'VOLANTEXRC Sport Cub S2 3CH RTF Xpilot 761-14 beginner RC plane United Kingdom GBP',
      'GB',
      'GBP',
    );
    assert.match(q, /\bS2\b/);
    assert.match(q, /\b3CH\b/);
    assert.match(q, /761-14/);
    assert.doesNotMatch(q, /United Kingdom/i);
    assert.doesNotMatch(q, /\bGBP\b/);
  });

  it('keeps HobbyZone S 2 and HBZ444000', () => {
    const q = keywordsOnly(
      'HobbyZone Sport Cub S 2 615mm RTF SAFE telemetry HBZ444000 United Kingdom GBP',
      '',
      'GBP',
    );
    assert.match(q, /\bS 2\b|\bS\b/);
    assert.match(q, /HBZ444000/);
    assert.doesNotMatch(q, /United Kingdom/i);
  });

  it('keeps E-flite UMX Waco and EFLU53550Y', () => {
    const q = keywordsOnly(
      'E-flite UMX Waco Yellow BNF Basic EFLU53550Y AS3X SAFE park flying United Kingdom GBP',
      'United Kingdom',
      'GBP',
    );
    assert.match(q, /E-flite/i);
    assert.match(q, /EFLU53550Y/);
    assert.doesNotMatch(q, /United Kingdom/i);
  });

  it('still strips a real postcode after a location cue or as trailing leftover', () => {
    assert.doesNotMatch(
      keywordsOnly('trainer kits United Kingdom L40 4BA GBP', '', ''),
      /L40/,
    );
    assert.equal(keywordsOnly('balsa L40 4BA', '', ''), 'balsa');
    assert.equal(
      keywordsOnly('trainer kits United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP', '', ''),
      'trainer kits',
    );
  });

  it('does not strip a query that is only S2 3CH', () => {
    assert.equal(keywordsOnly('S2 3CH', '', ''), 'S2 3CH');
  });

  it('stripContextualUkPostcodes leaves mid-string product tokens', () => {
    const kept = stripContextualUkPostcodes('VOLANTEXRC Sport Cub S2 3CH RTF plane');
    assert.match(kept, /S2 3CH/);
    assert.equal(stripContextualUkPostcodes('balsa L40 4BA'), 'balsa');
  });

  it('cleanSearchesQueries rewrites leftover United Kingdom GBP (repost path)', () => {
    const cleaned = cleanSearchesQueries(
      [
        {
          q: 'VOLANTEXRC Sport Cub S2 3CH United Kingdom GBP',
          intent: 'page',
          maxResults: 10,
        },
      ],
      'GB',
      'GBP',
    );
    assert.equal(cleaned.length, 1);
    assert.match(cleaned[0].q, /S2 3CH/);
    assert.doesNotMatch(cleaned[0].q, /United Kingdom/i);
    assert.doesNotMatch(cleaned[0].q, /\bGBP\b/);
  });

  it('buildSearchesDoc keeps S2 3CH while dropping location', () => {
    const { doc } = buildSearchesDoc({
      review: {
        suggestedQueries: [
          'VOLANTEXRC Sport Cub S2 3CH RTF United Kingdom (Lathom, Ormskirk, L40 4BA; .co.uk) GBP',
        ],
      },
      steering: { market: 'GB', currency: 'GBP' },
      existing: { queries: [], exclude: [] },
      now: '2026-10-29T08:00:00.000Z',
    });
    assert.match(doc.queries[0].q, /S2 3CH/);
    assert.doesNotMatch(doc.queries[0].q, /L40/);
  });

  it('docs pin FR #5283 contextual postcodes', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(text, /FR #5283/);
    assert.match(text, /S2 3CH/);
  });
});
