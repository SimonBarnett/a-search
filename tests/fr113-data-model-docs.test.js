'use strict';

/** FR-113: docs/data-model.md madeiradb dbo inventory + ERD pin */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const doc = path.join(root, 'docs', 'data-model.md');

const REQUIRED_NAMES = [
  'Users',
  'MerchantProducts',
  'Products',
  'Catalog',
  'RejectedAsins',
  'clubscan',
];

describe('FR-113 docs/data-model.md', () => {
  it('docs/data-model.md exists', () => {
    assert.ok(fs.existsSync(doc), 'missing docs/data-model.md');
  });

  it('names core identity/product/catalog tables', () => {
    const text = fs.readFileSync(doc, 'utf8');
    for (const name of REQUIRED_NAMES) {
      assert.match(text, new RegExp('\\b' + name + '\\b'), 'doc names ' + name);
    }
  });

  it('has Mermaid ERD and as-of row counts', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.match(text, /```mermaid/);
    assert.match(text, /erDiagram|flowchart/);
    assert.match(text, /as of|As of|2026-10-08/i);
    assert.match(text, /logical \(no FK\)/i);
    assert.match(text, /no FK|none/i);
  });

  it('README Docs and vision UNKNOWN point at data-model.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const vision = fs.readFileSync(path.join(root, 'docs', 'vision.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
    assert.match(vision, /data-model\.md/);
  });

  it('doc has no credential connection strings', () => {
    const text = fs.readFileSync(doc, 'utf8');
    assert.doesNotMatch(text, /Password\s*=/i);
    assert.doesNotMatch(text, /Pwd\s*=/i);
    assert.doesNotMatch(text, /AccountKey=/i);
  });
});
