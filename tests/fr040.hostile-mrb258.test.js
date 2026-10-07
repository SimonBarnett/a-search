'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
describe('hostile MRB #258 FR-040', () => {
  it('rakuten search/normalize/fixture exist and stub message is gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'providers/live/rakuten/src/search.js')));
    assert.ok(fs.existsSync(path.join(root, 'providers/live/rakuten/src/normalize.js')));
    assert.ok(fs.existsSync(path.join(root, 'providers/live/rakuten/fixtures/product-search-ok.xml')));
    const w = fs.readFileSync(path.join(root, 'providers/live/rakuten/src/worker.js'), 'utf8');
    assert.match(w, /searchRakuten|writeResults/);
    assert.doesNotMatch(w, /scaffold-only|FR-018 stub/i);
    const { normalizeSearchItems } = require(path.join(root, 'providers/live/rakuten/src/normalize.js'));
    assert.equal(typeof normalizeSearchItems, 'function');
  });
});
