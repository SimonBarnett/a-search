'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const impact = path.join(root, 'providers', 'local', 'impact');

const REQUIRED = [
  'AGENTS.md',
  path.join('.grok', 'skills', 'a-search-impact', 'SKILL.md'),
  '.env.example',
  path.join('src', 'worker.js'),
  path.join('src', 'queryParts.js'),
];

describe('FR-021 impact local provider scaffold', () => {
  it('layout paths exist', () => {
    for (const rel of REQUIRED) {
      const p = path.join(impact, rel);
      assert.ok(
        fs.existsSync(p),
        `missing ${path.join('providers/local/impact', rel)}`,
      );
    }
  });

  it('skill mentions MSSQL Parts search', () => {
    const text = fs.readFileSync(
      path.join(impact, '.grok', 'skills', 'a-search-impact', 'SKILL.md'),
      'utf8',
    );
    assert.match(text, /MSSQL|Parts/i);
  });

  it('run(msg) returns products from mock query', async () => {
    const { run } = require('../providers/local/impact/src/worker');
    assert.equal(typeof run, 'function');

    const mockRows = [
      {
        Source: 'impact',
        FeedKey: 'camp1',
        MerchantProductId: 'sku-100',
        Env: 'sandbox',
        Title: 'Mock Impact Headphones',
        Description: 'scaffold fixture',
        Url: 'https://example.test/p/sku-100',
        ImageUrl: 'https://example.test/i/sku-100.jpg',
        Price: 19.99,
        Currency: 'GBP',
        Stock: 'in_stock',
      },
      {
        Source: 'impact',
        FeedKey: 'camp1',
        MerchantProductId: 'sku-200',
        Env: 'sandbox',
        Title: 'Mock Impact Cable',
        Url: 'https://example.test/p/sku-200',
        Price: 4.5,
        Currency: 'GBP',
      },
    ];

    const puts = [];
    const out = await run(
      {
        searchId: 'srch_impact_test',
        userId: 'U1',
        env: 'sandbox',
        source: 'impact',
        q: 'headphones',
        catalogId: 1,
        category: 'Electronics',
        subcategory: 'Headphones',
      },
      {
        env: {
          A_SEARCH_ENV: 'sandbox',
          S3_RESULTS_BUCKET: 'test-results',
        },
        queryParts: async (msg) => {
          assert.equal(msg.source, 'impact');
          assert.equal(msg.env, 'sandbox');
          assert.equal(msg.q, 'headphones');
          return mockRows;
        },
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
      },
    );

    assert.equal(out.ok, true);
    assert.equal(out.source, 'impact');
    assert.equal(out.searchId, 'srch_impact_test');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 2);
    assert.equal(out.products[0].id, 'sku-100');
    assert.equal(out.products[0].title, 'Mock Impact Headphones');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].currency, 'GBP');
    assert.equal(out.products[1].id, 'sku-200');
    assert.equal(typeof out.message, 'undefined');
    assert.equal(puts.length, 1);
  });
});
