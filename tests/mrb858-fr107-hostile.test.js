'use strict';

/**
 * MRB #858 hostile pins for FR-107 wix queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  WixMssqlConfigError,
  SELECT_SQL,
} = require('../providers/local/wix/src/queryParts');
const {
  run,
  resolveWixProductUrl,
} = require('../providers/local/wix/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  WIX_STORE_URL: 'https://madeira-demo.wixsite.com/shop',
  WIX_AFFILIATE_ID: 'aff-hostile',
};

describe('MRB-858 FR-107 hostile', () => {
  it('registry wix stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const row = registry.sources.find((s) => s.id === 'wix');
    assert.ok(row);
    assert.equal(row.enabled.live, false);
    assert.equal(row.enabled.sandbox, false);
    assert.equal(row.queueEnv, 'SQS_WIX_URL');
  });

  it('SELECT_SQL pins Source=wix and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'wix'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws WixMssqlConfigError', async () => {
    await assert.rejects(
      () =>
        defaultQueryParts(
          { env: 'sandbox', q: 'x' },
          { env: { A_SEARCH_ENV: 'sandbox' } },
        ),
      (err) => {
        assert.ok(err instanceof WixMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> writeResults with sid track + relative Url resolve', async () => {
    const puts = [];
    const row = {
      Source: 'wix',
      FeedKey: 'madeira-demo',
      MerchantProductId: 'p1',
      Env: 'sandbox',
      Title: 'Sun Hat',
      Description: 'desc',
      Url: '/product-page/sun-hat',
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
        source: 'wix',
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
    assert.equal(result.source, 'wix');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /wixsite\.com|madeira-demo/);
    assert.match(String(result.products[0].url), /sid=aff-hostile/);
    assert.equal(puts.length, 1);
  });

  it('resolveWixProductUrl needs STORE_URL for relative paths', () => {
    assert.throws(
      () => resolveWixProductUrl('/product-page/x', {}),
      /WIX_STORE_URL/,
    );
    assert.equal(
      resolveWixProductUrl('/product-page/x', {
        WIX_STORE_URL: 'https://madeira-demo.wixsite.com/shop',
      }),
      'https://madeira-demo.wixsite.com/shop/product-page/x',
    );
  });

  it('worker source no longer contains not-wired stub; no catalog.js import', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'wix', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.doesNotMatch(src, /fetchCatalogPage|catalog\.js/);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill keep-both FR-105/106/107; .env secrets empty; ASCII', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'wix',
        '.grok',
        'skills',
        'a-search-wix',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /## Catalogue client \(FR-105\)/);
    assert.match(skill, /## Normalize \+ upsert \(FR-106\)/);
    assert.match(skill, /## Worker \+ queryParts \(FR-107\)/);
    assert.match(skill, /stay dark|enabled.*false/i);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(skill));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'wix', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^WIX_AFFILIATE_ID=\s*$/m);
    assert.match(envEx, /^WIX_API_TOKEN=\s*$/m);
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(envEx));
  });
});
