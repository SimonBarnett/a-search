'use strict';

/**
 * MRB #898 hostile pins for FR-115 docs/catalog-model.md catalogId/ASIN map.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalogDoc = path.join(root, 'docs', 'catalog-model.md');

describe('MRB-898 FR-115 hostile', () => {
  it('catalogId is Catalog.ID owned by JWT userId; UQs pinned', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /catalogId/);
    assert.match(text, /Catalog\.ID/);
    assert.match(text, /UserId,\s*MainCategory,\s*SubCategory/i);
    assert.match(
      text,
      /UserId,\s*Category,\s*Subcategory,\s*ASIN,\s*Source/i,
    );
    assert.match(
      text,
      /UserId,\s*AffiliateKey,\s*MainCategory,\s*SubCategory,\s*ASIN/i,
    );
  });

  it('source id casing: amazon/paapi, ebay/eBay, awin', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /paapi/);
    assert.match(text, /amazon/i);
    assert.match(text, /eBay|ebay/);
    assert.match(text, /\bawin\b/i);
  });

  it('prices are nvarchar display strings; no api_key_data secrets', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /nvarchar\(50\)|display string/i);
    assert.doesNotMatch(text, /api_key_data\s*[:=]\s*['\"][^'\"]+['\"]/);
    assert.doesNotMatch(text, /Password\s*=/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text));
  });

  it('Part/Part2 + CatalogAffiliateUpdates schedule noted', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /Part2|dbo\.Part/);
    assert.match(text, /CatalogAffiliateUpdates/);
    assert.match(text, /ON DELETE CASCADE/i);
  });

  it('README keep-both FR-113/114/115; related docs updated', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(readme, /docs\/identity\.md/);
    assert.match(readme, /docs\/catalog-model\.md/);
    const endpoint = fs.readFileSync(
      path.join(root, 'docs', 'endpoint-search.md'),
      'utf8',
    );
    assert.match(endpoint, /Catalog\.ID/);
    const tracked = fs.readFileSync(
      path.join(root, 'docs', 'tracked-links.md'),
      'utf8',
    );
    assert.match(tracked, /Part2/);
    const resultSchema = fs.readFileSync(
      path.join(root, 'docs', 'result-schema.md'),
      'utf8',
    );
    assert.match(resultSchema, /nvarchar|display string/i);
  });
});
