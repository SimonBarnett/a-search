'use strict';

/** FR-042: Shared product result schema + normalizeProduct helper */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const schemaDoc = path.join(root, 'docs', 'result-schema.md');
const helperPath = path.join(root, 'worker', 'lib', 'normalizeProduct.js');
const fixturePath = path.join(
  root,
  'providers',
  'live',
  'amazon',
  'fixtures',
  'search-items-ok.json',
);

describe('FR-042 result schema + normalizeProduct', () => {
  it('docs/result-schema.md lists required fields', () => {
    assert.ok(fs.existsSync(schemaDoc), 'docs/result-schema.md must exist');
    const text = fs.readFileSync(schemaDoc, 'utf8');
    for (const field of [
      'id',
      'title',
      'url',
      'price',
      'currency',
      'imageUrl',
      'source',
      'raw',
    ]) {
      assert.match(text, new RegExp(`\\b${field}\\b`));
    }
  });

  it('worker/lib/normalizeProduct.js exports assert + normalize', () => {
    assert.ok(fs.existsSync(helperPath));
    const mod = require(helperPath);
    assert.equal(typeof mod.assertProductSchema, 'function');
    assert.equal(typeof mod.normalizeProduct, 'function');
    assert.equal(typeof mod.ProductSchemaError, 'function');
  });

  it('assertProductSchema rejects missing id/title/source', () => {
    const { assertProductSchema, ProductSchemaError } = require(helperPath);
    assert.throws(
      () => assertProductSchema({ title: 't', source: 'amazon' }),
      ProductSchemaError,
    );
    assert.throws(
      () => assertProductSchema({ id: '1', source: 'amazon' }),
      ProductSchemaError,
    );
    assert.throws(
      () => assertProductSchema({ id: '1', title: 't' }),
      ProductSchemaError,
    );
    assert.throws(() => assertProductSchema(null), ProductSchemaError);
    assert.doesNotThrow(() =>
      assertProductSchema({ id: '1', title: 't', source: 'amazon' }),
    );
  });

  it('normalizeProduct fills canonical keys; optional raw preserved', () => {
    const { normalizeProduct, assertProductSchema } = require(helperPath);
    const p = normalizeProduct({
      id: 42,
      title: 'Widget',
      source: 'amazon',
      url: 'https://example.test/p',
      price: '9.99',
      currency: 'GBP',
      imageUrl: 'https://example.test/i.jpg',
      raw: { asin: 'X' },
    });
    assert.equal(p.id, '42');
    assert.equal(p.title, 'Widget');
    assert.equal(p.source, 'amazon');
    assert.equal(p.url, 'https://example.test/p');
    assert.equal(p.price, 9.99);
    assert.equal(p.currency, 'GBP');
    assert.equal(p.imageUrl, 'https://example.test/i.jpg');
    assert.deepEqual(p.raw, { asin: 'X' });
    assertProductSchema(p);
  });

  it('amazon fixture normalize output satisfies schema', () => {
    const { assertProductSchema } = require(helperPath);
    const { normalizeSearchResponse } = require(
      '../providers/live/amazon/src/normalize',
    );
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const products = normalizeSearchResponse(fixture);
    assert.equal(products.length, 2);
    for (const p of products) {
      assertProductSchema(p);
      assert.equal(p.source, 'amazon');
    }
    assert.equal(products[0].id, 'B0TESTASIN1');
    assert.equal(products[0].title, 'Fixture Wireless Headphones');
  });
});
