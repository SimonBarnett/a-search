'use strict';

/**
 * MRB #850 hostile pins for FR-103 shopify queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  ShopifyMssqlConfigError,
  SELECT_SQL,
} = require('../providers/local/shopify/src/queryParts');
const {
  run,
  normalizePart,
  resolveShopifyProductUrl,
} = require('../providers/local/shopify/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
  SHOPIFY_AFFILIATE_ID: 'aff-hostile',
};

describe('MRB-850 FR-103 hostile', () => {
  it('registry shopify stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'shopify');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.queueEnv, 'SQS_SHOPIFY_URL');
  });

  it('SELECT_SQL pins Source=shopify and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'shopify'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws ShopifyMssqlConfigError', async () => {
    await assert.rejects(
      () =>
        defaultQueryParts(
          { env: 'sandbox', q: 'x' },
          { env: { A_SEARCH_ENV: 'sandbox' } },
        ),
      (err) => {
        assert.ok(err instanceof ShopifyMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> writeResults with sid track + relative Url resolve', async () => {
    const puts = [];
    const row = {
      Source: 'shopify',
      FeedKey: 'madeira-demo',
      MerchantProductId: '801001',
      Env: 'sandbox',
      Title: 'Sun Hat',
      Description: 'desc',
      Url: '/products/madeira-sun-hat',
      ImageUrl: 'https://cdn.example.invalid/hat.jpg',
      Price: 24.5,
      Currency: 'GBP',
      Stock: 'in_stock',
    };
    const result = await run(
      {
        env: 'sandbox',
        userId: 'u1',
        catalogId: 'c1',
        searchId: 's1',
        q: 'hat',
        source: 'shopify',
      },
      {
        env: mssqlEnv,
        queryParts: async () => [row],
        putObject: async (args) => {
          puts.push(args);
          return { ETag: '"x"' };
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(result.source, 'shopify');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /madeira-demo\.myshopify\.com/);
    assert.match(String(result.products[0].url), /sid=aff-hostile/);
    assert.equal(puts.length, 1);
  });

  it('resolveShopifyProductUrl needs STORE_URL for relative paths', () => {
    assert.throws(
      () => resolveShopifyProductUrl('/products/x', {}),
      /SHOPIFY_STORE_URL/,
    );
    assert.equal(
      resolveShopifyProductUrl('/products/x', {
        SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
      }),
      'https://madeira-demo.myshopify.com/products/x',
    );
  });

  it('worker source no longer contains not-wired stub; no catalog.js import', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'shopify', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.doesNotMatch(src, /fetchCatalogPage|catalog\.js/);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill keep-both FR-101/102/103; .env secrets empty; ASCII', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'shopify',
        '.grok',
        'skills',
        'a-search-shopify',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-101\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-102\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-103\)/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'shopify', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^SHOPIFY_AFFILIATE_ID=\s*$/m);
    assert.match(envEx, /^SHOPIFY_ACCESS_TOKEN=\s*$/m);
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
  });
});
