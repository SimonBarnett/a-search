'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const awin = path.join(root, 'providers', 'local', 'awin');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-awin', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
];

describe('FR-020 awin local provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(awin, rel);
      assert.ok(
        fs.existsSync(p),
        `missing ${path.join('providers/local/awin', rel)}`,
      );
    }
  });

  it('run(msg) returns products from mock query', async () => {
    const { run } = require('../providers/local/awin/src/worker');
    assert.equal(typeof run, 'function');

    const mockRows = [
      {
        Source: 'awin',
        FeedKey: 'adv1',
        MerchantProductId: 'sku-100',
        Env: 'sandbox',
        Title: 'Mock Awin Headphones',
        Description: 'scaffold fixture',
        Url: 'https://example.test/p/sku-100',
        ImageUrl: 'https://example.test/i/sku-100.jpg',
        Price: 19.99,
        Currency: 'GBP',
        Stock: 'in_stock',
      },
      {
        Source: 'awin',
        FeedKey: 'adv1',
        MerchantProductId: 'sku-200',
        Env: 'sandbox',
        Title: 'Mock Awin Cable',
        Url: 'https://example.test/p/sku-200',
        Price: 4.5,
        Currency: 'GBP',
      },
    ];

    const out = await run(
      {
        searchId: 'srch_awin_test',
        userId: 'U1',
        env: 'sandbox',
        source: 'awin',
        q: 'headphones',
        catalogId: 1,
        category: 'Electronics',
        subcategory: 'Headphones',
      },
      {
        queryParts: async (msg) => {
          assert.equal(msg.source, 'awin');
          assert.equal(msg.env, 'sandbox');
          assert.equal(msg.q, 'headphones');
          return mockRows;
        },
      },
    );

    assert.equal(out.ok, true);
    assert.equal(out.source, 'awin');
    assert.equal(out.searchId, 'srch_awin_test');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'sku-100');
    assert.equal(out.products[0].title, 'Mock Awin Headphones');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[1].id, 'sku-200');
  });
});
