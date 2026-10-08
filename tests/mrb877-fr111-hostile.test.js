'use strict';

/**
 * MRB #877 hostile pins for FR-111 woocommerce queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  WooCommerceMssqlConfigError,
  SELECT_SQL,
} = require('../providers/local/woocommerce/src/queryParts');
const {
  run,
  resolveWooCommerceProductUrl,
} = require('../providers/local/woocommerce/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
  WOOCOMMERCE_AFFILIATE_ID: 'aff-hostile',
};

describe('MRB-877 FR-111 hostile', () => {
  it('registry woocommerce stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'woocommerce');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.queueEnv, 'SQS_WOOCOMMERCE_URL');
  });

  it('SELECT_SQL pins Source=woocommerce and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'woocommerce'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws WooCommerceMssqlConfigError', async () => {
    await assert.rejects(
      () =>
        defaultQueryParts(
          { env: 'sandbox', q: 'x' },
          { env: { A_SEARCH_ENV: 'sandbox' } },
        ),
      (err) => {
        assert.ok(err instanceof WooCommerceMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> writeResults with sid track + relative Url resolve', async () => {
    const puts = [];
    const row = {
      Source: 'woocommerce',
      FeedKey: 'madeira-demo',
      MerchantProductId: 'p1',
      Env: 'sandbox',
      Title: 'Sun Hat',
      Description: 'desc',
      Url: '/product/sun-hat',
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
        source: 'woocommerce',
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
    assert.equal(result.source, 'woocommerce');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /example\.invalid/);
    assert.match(String(result.products[0].url), /sid=aff-hostile/);
    assert.equal(puts.length, 1);
  });

  it('resolveWooCommerceProductUrl needs STORE_URL for relative paths', () => {
    assert.throws(
      () => resolveWooCommerceProductUrl('/product/x', {}),
      /WOOCOMMERCE_STORE_URL/,
    );
    assert.equal(
      resolveWooCommerceProductUrl('/product/x', {
        WOOCOMMERCE_STORE_URL: 'https://madeira-demo.example.invalid',
      }),
      'https://madeira-demo.example.invalid/product/x',
    );
  });

  it('worker source no longer contains not-wired stub; no catalog.js import', () => {
    const src = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'woocommerce',
        'src',
        'worker.js',
      ),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.doesNotMatch(src, /fetchCatalogPage|catalog\.js/);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill keep-both FR-109/110/111; .env secrets empty; ASCII', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'woocommerce',
        '.grok',
        'skills',
        'a-search-woocommerce',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-109\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-110\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-111\)/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'woocommerce', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^WOOCOMMERCE_AFFILIATE_ID=\s*$/m);
    assert.match(envEx, /^WOOCOMMERCE_CONSUMER_KEY=\s*$/m);
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
  });
});
