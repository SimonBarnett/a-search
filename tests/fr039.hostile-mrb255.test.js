'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('hostile MRB #255 FR-039', () => {
  it('ebay search/normalize/fixture exist and stub message is gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'providers/live/ebay/src/search.js')));
    assert.ok(fs.existsSync(path.join(root, 'providers/live/ebay/src/normalize.js')));
    assert.ok(fs.existsSync(path.join(root, 'providers/live/ebay/fixtures/item-summary-ok.json')));
    const w = fs.readFileSync(path.join(root, 'providers/live/ebay/src/worker.js'), 'utf8');
    assert.match(w, /searchEbay|writeResults/);
    assert.doesNotMatch(w, /scaffold-only|FR-017 stub/i);
    const { normalizeSearchResponse } = require(path.join(root, 'providers/live/ebay/src/normalize.js'));
    const fix = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/live/ebay/fixtures/item-summary-ok.json'), 'utf8'),
    );
    const products = normalizeSearchResponse(fix);
    assert.ok(Array.isArray(products) && products.length >= 1);
    assert.equal(products[0].source, 'ebay');
  });
});
