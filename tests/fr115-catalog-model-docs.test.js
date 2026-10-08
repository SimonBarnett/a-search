'use strict';

/** FR-115: catalog/product/ASIN model docs pins */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const catalogDoc = path.join(root, 'docs', 'catalog-model.md');
const endpoint = path.join(root, 'docs', 'endpoint-search.md');
const tracked = path.join(root, 'docs', 'tracked-links.md');
const resultSchema = path.join(root, 'docs', 'result-schema.md');

describe('FR-115 docs/catalog-model.md', () => {
  it('exists and maps a-search fields to dbo columns', () => {
    assert.ok(fs.existsSync(catalogDoc), 'missing docs/catalog-model.md');
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /catalogId/);
    assert.match(text, /Catalog\.ID/);
    assert.match(text, /MainCategory|SubCategory/);
    assert.match(text, /MerchantProducts/);
    assert.match(text, /RejectedAsins/);
    assert.match(text, /CatalogAffiliateUpdates/);
    assert.match(text, /Products/);
    assert.match(text, /ASIN/);
    assert.match(text, /paapi/);
    assert.match(text, /eBay|ebay/);
    assert.match(text, /unique|UQ/i);
    assert.match(text, /nvarchar\(50\)|display string|string Price/i);
    assert.doesNotMatch(text, /api_key_data\s*[:=]\s*['\"][^'\"]+['\"]/);
    assert.doesNotMatch(text, /Password\s*=/i);
  });

  it('lists unique keys for Catalog, Products, RejectedAsins', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /UserId,\s*MainCategory,\s*SubCategory|UQ.*UserId.*MainCategory.*SubCategory/i);
    assert.match(
      text,
      /UserId,\s*Category,\s*Subcategory,\s*ASIN,\s*Source|UQ.*UserId.*Category.*Subcategory.*ASIN.*Source/i,
    );
    assert.match(
      text,
      /UserId,\s*AffiliateKey,\s*MainCategory,\s*SubCategory,\s*ASIN|UQ.*UserId.*AffiliateKey.*MainCategory/i,
    );
  });

  it('maps a-search source ids to AffiliateKey / Source values', () => {
    const text = fs.readFileSync(catalogDoc, 'utf8');
    assert.match(text, /amazon/i);
    assert.match(text, /paapi/);
    assert.match(text, /\bawin\b/i);
    assert.match(text, /eBay|ebay/);
  });

  it('README links catalog-model.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/catalog-model\.md/);
  });
});

describe('FR-115 endpoint-search catalogId + related docs', () => {
  it('endpoint-search.md defines catalogId as Catalog.ID', () => {
    const text = fs.readFileSync(endpoint, 'utf8');
    assert.match(text, /catalogId/);
    assert.match(text, /Catalog\.ID/);
    assert.match(text, /JWT|userId/);
  });

  it('tracked-links.md documents Part2 read-time rewriting', () => {
    const text = fs.readFileSync(tracked, 'utf8');
    assert.match(text, /Part2/);
    assert.match(text, /clickref|tag=mymodelflying/i);
    assert.match(text, /twice|double|already tagged|do not tag/i);
  });

  it('result-schema.md relates numeric price to DB display strings', () => {
    const text = fs.readFileSync(resultSchema, 'utf8');
    assert.match(text, /nvarchar|display string|string.*Price/i);
    assert.match(text, /catalog-model\.md|madeiradb|Products/i);
  });
});
