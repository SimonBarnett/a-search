'use strict';

/** MRB #691 hostile: FR-067 skimlinks search stay-dark + fixture shape. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #691 hostile FR-067 skimlinks search', () => {
  it('search.js injectable + credential assert; no enable', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers/live/skimlinks/src/search.js'),
      'utf8',
    );
    assert.match(src, /httpRequest/);
    assert.match(src, /assertSkimlinksCreds|skimlinks_missing_credentials/);
    assert.match(src, /\/product\/query/);
    assert.match(src, /Stay-dark|stay-dark|do not enable/i);
    assert.doesNotMatch(src, /enabled\.live\s*=\s*true/);
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

  it('registry stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers/registry.json'), 'utf8'),
    );
    const sl = registry.sources.find((s) => s.id === 'skimlinks');
    assert.equal(sl.enabled.live, false);
    assert.equal(sl.enabled.sandbox, false);
  });
});
