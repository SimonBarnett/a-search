'use strict';

/** MRB #691 hostile: FR-067 skimlinks search + fixture shape (enabled FR-168). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #691 hostile FR-067 skimlinks search', () => {
  it('search.js injectable + credential assert; FR-168 enabled', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/skimlinks/src/search.js'),
      'utf8',
    );
    assert.match(src, /httpRequest/);
    assert.match(src, /assertSkimlinksCreds|skimlinks_missing_credentials/);
    assert.match(src, /\/product\/query/);
    assert.match(src, /FR-067|FR-168|Registry enabled true/i);
  });

  it('fixture uses skimlinksProductAPI.products and example.test URLs', () => {
    const fix = JSON.parse(
      fs.readFileSync(
        path.join(root, 'providers/live/skimlinks/fixtures/products-ok.json'),
        'utf8',
      ),
    );
    assert.ok(fix.skimlinksProductAPI);
    assert.ok(Array.isArray(fix.skimlinksProductAPI.products));
    assert.ok(fix.skimlinksProductAPI.products.length >= 1);
    const blob = JSON.stringify(fix);
    assert.match(blob, /example\.test/);
  });

  it('registry enabled true (FR-168)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const sl = registry.sources.find((s) => s.id === 'skimlinks');
    assert.equal(sl.enabled.live, true);
    assert.equal(sl.enabled.sandbox, true);
  });
});
