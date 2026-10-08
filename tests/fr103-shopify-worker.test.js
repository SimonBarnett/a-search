'use strict';

/** FR-103: shopify MSSQL queryParts + writeResults (stay-dark). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  run,
  ShopifyMssqlConfigError,
  resolveShopifyProductUrl,
} = require('../providers/local/shopify/src/worker');
const {
  defaultQueryParts,
  mssqlConfigFromEnv,
  searchTextFromMsg,
  SELECT_SQL,
} = require('../providers/local/shopify/src/queryParts');
const { resultsKey } = require('../shared/resultsPath');

const root = path.join(__dirname, '..');

const baseMsg = {
  searchId: 'srch_shopify_103',
  userId: 'U-SH',
  env: 'sandbox',
  source: 'shopify',
  q: 'hat',
  catalogId: 7,
};

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
  SHOPIFY_AFFILIATE_ID: 'sh-aff-test',
};

function mockPool(recordset) {
  const inputs = {};
  return {
    request() {
      const api = {
        input(name, _type, value) {
          inputs[name] = value;
          return api;
        },
        async query(sqlText) {
          assert.match(sqlText, /dbo\.Parts/i);
          assert.match(sqlText, /Source = N'shopify'/);
          assert.match(sqlText, /DeletedAt IS NULL/);
          return { recordset };
        },
      };
      return api;
    },
    async close() {},
    _inputs: inputs,
  };
}

describe('FR-103 shopify MSSQL queryParts + worker', () => {
  it('mock connection rows -> normalized products + writeResults (no not-wired)', async () => {
    const rows = [
      {
        Source: 'shopify',
        FeedKey: 'madeira-demo',
        MerchantProductId: '801001',
        Env: 'sandbox',
        Title: 'Madeira Sun Hat',
        Description: 'woven hat',
        Url: '/products/madeira-sun-hat',
        ImageUrl: 'https://cdn.example.invalid/hat.jpg',
        Price: 24.5,
        Currency: 'GBP',
        Stock: '12',
      },
    ];
    const puts = [];
    let connectCalls = 0;

    const out = await run(baseMsg, {
      env: mssqlEnv,
      connect: async (cfg) => {
        connectCalls += 1;
        assert.equal(cfg.server, 'sql.test');
        assert.equal(cfg.database, 'a_search_sandbox');
        assert.equal(cfg.user, 'app');
        return mockPool(rows);
      },
      sqlTypes: { NVarChar: 'NVarChar' },
      putObject: async (args) => {
        puts.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(connectCalls, 1);
    assert.equal(out.ok, true);
    assert.equal(out.source, 'shopify');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 1);
    assert.equal(out.products[0].id, '801001');
    assert.equal(out.products[0].title, 'Madeira Sun Hat');
    assert.equal(out.products[0].description, 'woven hat');
    assert.equal(out.products[0].price, 24.5);
    assert.equal(out.products[0].source, 'shopify');
    assert.deepEqual(out.products[0].raw, {
      feedKey: 'madeira-demo',
      stock: '12',
    });
    assert.match(String(out.products[0].url), /madeira-demo\.myshopify\.com/);
    assert.match(String(out.products[0].url), /sid=sh-aff-test/);
    assert.equal(typeof out.message, 'undefined');
    assert.ok(!/not wired/i.test(JSON.stringify(out)));
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    assertProductSchema(out.products[0]);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'shopify',
        userId: 'U-SH',
        catalogId: 7,
        searchId: 'srch_shopify_103',
      }),
    );
  });

  it('empty recordset -> products [] and still writes results', async () => {
    const puts = [];
    const out = await run(baseMsg, {
      env: mssqlEnv,
      connect: async () => mockPool([]),
      sqlTypes: { NVarChar: 'NVarChar' },
      putObject: async (args) => {
        puts.push(args);
        return {};
      },
    });
    assert.deepEqual(out.products, []);
    assert.equal(puts.length, 1);
    const body = JSON.parse(puts[0].Body);
    assert.deepEqual(body.products, []);
  });

  it('missing MSSQL config -> clear ShopifyMssqlConfigError', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            S3_RESULTS_BUCKET: 'b',
            SHOPIFY_AFFILIATE_ID: 'x',
            SHOPIFY_STORE_URL: 'https://x.myshopify.com',
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.equal(err.name, 'ShopifyMssqlConfigError');
        assert.equal(err.code, 'shopify_mssql_missing_config');
        assert.match(String(err.message), /MSSQL_SERVER/);
        return true;
      },
    );
  });

  it('wrong-env message refused before SQL', async () => {
    await assert.rejects(
      () =>
        run(
          { ...baseMsg, env: 'live' },
          {
            env: mssqlEnv,
            connect: async () => {
              throw new Error('should not connect');
            },
            putObject: async () => {
              throw new Error('should not put');
            },
          },
        ),
      (err) => {
        assert.equal(err.name, 'EnvIsolationError');
        return true;
      },
    );
  });

  it('worker source no longer contains not-wired stub message', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'shopify', 'src', 'worker.js'),
      'utf8',
    );
    assert.ok(!/not wired yet/i.test(src));
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('SELECT pins Source=shopify and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source = N'shopify'/);
    assert.match(SELECT_SQL, /DeletedAt IS NULL/);
    assert.match(SELECT_SQL, /Title LIKE @like/);
  });

  it('resolveShopifyProductUrl joins store base for relative paths', () => {
    assert.equal(
      resolveShopifyProductUrl('/products/hat', {
        SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
      }),
      'https://madeira-demo.myshopify.com/products/hat',
    );
    assert.equal(
      resolveShopifyProductUrl('https://other.example/p/1', {
        SHOPIFY_STORE_URL: 'https://madeira-demo.myshopify.com',
      }),
      'https://other.example/p/1',
    );
  });

  it('registry shopify stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const s = registry.sources.find((x) => x.id === 'shopify');
    assert.ok(s);
    assert.equal(s.enabled.live, false);
    assert.equal(s.enabled.sandbox, false);
  });

  it('searchTextFromMsg and mssqlConfigFromEnv helpers', () => {
    assert.equal(searchTextFromMsg({ q: '  hats ' }), 'hats');
    assert.throws(
      () => mssqlConfigFromEnv({ MSSQL_USER: 'u' }),
      ShopifyMssqlConfigError,
    );
  });

  it('defaultQueryParts uses injected connect and closes pool', async () => {
    let closed = false;
    const pool = mockPool([
      {
        Source: 'shopify',
        MerchantProductId: '1',
        Title: 'T',
        Env: 'sandbox',
      },
    ]);
    pool.close = async () => {
      closed = true;
    };
    const rows = await defaultQueryParts(baseMsg, {
      env: mssqlEnv,
      connect: async () => pool,
      sqlTypes: { NVarChar: 'NVarChar' },
    });
    assert.equal(rows.length, 1);
    assert.equal(closed, true);
  });
});
