'use strict';

/**
 * Hostile MRB #4923 extra pins: DONE exclude is case-insensitive;
 * search-fanout stays excluded; ensureWidget hasresults=0 next to enabled=0.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isExcludedKey } = require('../shared/aClubs/changeEvents');

describe('MRB #4923 hostile extra FR #4917', () => {
  it('DONE and search-fanout keys stay excluded (any case)', () => {
    assert.equal(isExcludedKey('club.example/guid-here/DONE/srch_x-ebay.json'), true);
    assert.equal(isExcludedKey('club.example/guid-here/done/srch_x-ebay.json'), true);
    assert.equal(
      isExcludedKey('club.example/guid-here/search-fanout.json'),
      true,
    );
    assert.equal(isExcludedKey('club.example/guid-here/searches.json'), false);
  });

  it('ensureWidget source stamps hasresults and enabled 0', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'parts-gateway', 'src', 'ensureWidget.js'),
      'utf8',
    );
    assert.match(src, /hasresults:\s*'0'/);
    assert.match(src, /enabled:\s*'0'/);
  });
});
