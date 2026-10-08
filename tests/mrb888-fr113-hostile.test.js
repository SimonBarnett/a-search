'use strict';

/**
 * MRB #888 hostile pins for FR-113 docs/data-model.md madeiradb inventory + ERD.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const docPath = path.join(root, 'docs', 'data-model.md');

describe('MRB-888 FR-113 hostile', () => {
  it('inventory names core tables + five real FKs + Parts gap', () => {
    const text = fs.readFileSync(docPath, 'utf8');
    for (const name of [
      'Users',
      'MerchantProducts',
      'Products',
      'Catalog',
      'RejectedAsins',
      'clubscan',
      'Partner',
      'UserApiKeys',
    ]) {
      assert.match(text, new RegExp('\\b' + name + '\\b'));
    }
    assert.match(text, /CatalogAffiliateUpdates/);
    assert.match(text, /ON DELETE CASCADE/i);
    assert.match(text, /five|5\b/i);
    assert.match(text, /dbo\.Parts/);
    assert.match(text, /do not exist|none of.*Parts|Parts.*exist/i);
  });

  it('Mermaid ERD pins Users logical (no FK) joins + declared FKs', () => {
    const text = fs.readFileSync(docPath, 'utf8');
    assert.match(text, /```mermaid/);
    assert.match(text, /erDiagram/);
    assert.match(text, /Users \|\|\.\.o\{ Catalog/);
    assert.match(text, /Users \|\|\.\.o\{ Products/);
    assert.match(text, /Users \|\|\.\.o\{ MerchantProducts/);
    assert.match(text, /Users \|\|\.\.o\{ RejectedAsins/);
    assert.match(text, /Users \|\|\.\.o\{ clubscan/);
    assert.match(text, /Users \|\|\.\.o\{ Partner/);
    assert.match(text, /Users \|\|--o\{ UserApiKeys/);
    assert.match(text, /Catalog \|\|--o\{ CatalogAffiliateUpdates/);
    assert.match(text, /logical \(no FK\)/i);
  });

  it('as-of date, refresh via sys catalogs, no credentials', () => {
    const text = fs.readFileSync(docPath, 'utf8');
    assert.match(text, /2026-10-08/);
    assert.match(text, /How to refresh/i);
    assert.match(text, /sys\.tables/);
    assert.match(text, /sys\.columns/);
    assert.match(text, /sys\.indexes/);
    assert.match(text, /sys\.foreign_keys/);
    assert.doesNotMatch(text, /Password\s*=/i);
    assert.doesNotMatch(text, /Pwd\s*=/i);
    assert.doesNotMatch(text, /AccountKey=/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text));
  });

  it('README + vision UNKNOWN link data-model.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const vision = fs.readFileSync(path.join(root, 'docs', 'vision.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(vision, /data-model\.md/);
  });

  it('clubs is documented as TVF not a table', () => {
    const text = fs.readFileSync(docPath, 'utf8');
    assert.match(text, /clubs/);
    assert.match(text, /inline table-valued function|TVF/i);
  });
});
