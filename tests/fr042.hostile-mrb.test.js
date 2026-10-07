'use strict';

/** Hostile pins for FR-042 shared result schema */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const amazonNormalize = path.join(
  root,
  'providers',
  'live',
  'amazon',
  'src',
  'normalize.js',
);

describe('FR-042 hostile: shared result schema', () => {
  it('amazon normalize requires worker/lib/normalizeProduct', () => {
    const src = fs.readFileSync(amazonNormalize, 'utf8');
    assert.match(src, /normalizeProduct/);
    assert.match(src, /worker[/\\]lib[/\\]normalizeProduct|worker\/lib\/normalizeProduct/);
  });

  it('schema doc forbids inventing undocumented top-level keys without shared doc', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'result-schema.md'),
      'utf8',
    );
    assert.match(text, /required/i);
    assert.match(text, /optional/i);
    assert.match(text, /do not invent|must not invent|incompatible/i);
    assert.match(text, /description/);
  });

  it('awin normalizePart satisfies shared schema (feedKey/stock under raw)', () => {
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    const { normalizePart } = require('../providers/local/awin/src/worker');
    const p = normalizePart({
      MerchantProductId: 'sku-1',
      Title: 'Part',
      Description: 'desc',
      FeedKey: 'adv',
      Stock: 'in_stock',
      Source: 'awin',
      Price: 1.5,
      Currency: 'GBP',
    });
    assertProductSchema(p);
    assert.equal(p.id, 'sku-1');
    assert.equal(p.description, 'desc');
    assert.equal(p.raw.feedKey, 'adv');
    assert.equal(p.raw.stock, 'in_stock');
    assert.equal(p.feedKey, undefined);
    assert.equal(p.stock, undefined);
  });
});
