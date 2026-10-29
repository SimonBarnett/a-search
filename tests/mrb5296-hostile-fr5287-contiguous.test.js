'use strict';

/**
 * docs/mrb-5296: CI pin -- guidSearch.js must keep contiguous `FR #5287`
 * (not `FR #5283 / #5287`) so tests/mrb5291-hostile-fr5287-reclean.test.js stays green.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-5296 hostile contiguous FR #5287 pin', () => {
  it('cleanSearchesQueries banner has contiguous FR #5287', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'redqueen', 'src', 'guidSearch.js'),
      'utf8',
    );
    assert.match(src, /FR #5287/);
    assert.doesNotMatch(src, /FR #5283 \/ #5287/);
  });
});
