'use strict';

/**
 * docs/mrb-5286: hostile pins for FR #5283 contextual UK postcode strip.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  keywordsOnly,
  stripContextualUkPostcodes,
} = require('../shared/search/cleanSearchQuery');

describe('docs/mrb-5286 hostile FR #5283', () => {
  it('keeps mid-string S2 3CH and trailing radio lookalike', () => {
    const mid = keywordsOnly(
      'VOLANTEXRC Sport Cub S2 3CH RTF Xpilot 761-14',
      'GB',
      'GBP',
    );
    assert.match(mid, /S2 3CH/);
    assert.equal(keywordsOnly('Sport Cub S2 3CH', '', ''), 'Sport Cub S2 3CH');
    assert.equal(stripContextualUkPostcodes('Cub S2 3CH'), 'Cub S2 3CH');
  });

  it('strips trailing real postcode leftover and cue-bound postcode', () => {
    assert.equal(keywordsOnly('balsa L40 4BA', '', ''), 'balsa');
    assert.doesNotMatch(
      keywordsOnly('kits United Kingdom L40 4BA GBP', 'GB', 'GBP'),
      /L40/,
    );
  });

  it('cleanSearchQuery.js pins contiguous FR #5283 contextual strip', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'shared', 'search', 'cleanSearchQuery.js'),
      'utf8',
    );
    assert.match(src, /FR #5283/);
    assert.match(src, /stripContextualUkPostcodes/);
    assert.match(src, /isRadioChannelPostcodeLookalike/);
    assert.match(src, /nCH|\\dCH/i);
    assert.doesNotMatch(
      src,
      /q = q\.replace\(UK_POSTCODE,\s*' '\)/,
    );
  });
});