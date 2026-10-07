'use strict';

/** FR-044: Impact MSSQL queryParts + writeResults */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  run,
  ImpactMssqlConfigError,
} = require('../providers/local/impact/src/worker');
const {
  defaultQueryParts,
  mssqlConfigFromEnv,
  searchTextFromMsg,
  SELECT_SQL,
} = require('../providers/local/impact/src/queryParts');
const { resultsKey } = require('../worker/lib/resultsPath');

const baseMsg = {
  searchId: 'srch_impact_44',
  userId: 'U-IMPACT',
  env: 'sandbox',
  source: 'impact',
  q: 'headphones',
  catalogId: 7,
};

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
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
          assert.match(sqlText, /Source = N'impact'/);
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

describe('FR-044 impact MSSQL queryParts', () => {
  it('mock connection rows -> normalized products + writeResults', async () => {
    const rows = [
      {
        Source: 'impact',
        FeedKey: 'camp1',
        MerchantProductId: 'sku-100',
        Env: 'sandbox',
        Title: 'Mock Impact Headphones',
        Description: 'noise cancelling',
        Url: 'https://example.test/p/sku-100',
        ImageUrl: 'https://example.test/i/sku-100.jpg',
        Price: 19.99,
        Currency: 'GBP',
        Stock: 'in_stock',
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
    assert.equal(out.source, 'impact');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 1);
    assert.equal(out.products[0].id, 'sku-100');
    assert.equal(out.products[0].title, 'Mock Impact Headphones');
    assert.equal(out.products[0].description, 'noise cancelling');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].source, 'impact');
    assert.deepEqual(out.products[0].raw, {
      feedKey: 'camp1',
      stock: 'in_stock',
    });
    assert.equal(out.products[0].feedKey, undefined);
    assert.equal(out.products[0].stock, undefined);
    assert.equal(typeof out.message, 'undefined');
    const { assertProductSchema } = require('../worker/lib/normalizeProduct');
    assertProductSchema(out.products[0]);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'test-results');
    assert.equal(
      puts[0].Key,
      resultsKey({
        env: 'sandbox',
        source: 'impact',
        userId: 'U-IMPACT',
        catalogId: 7,
        searchId: 'srch_impact_44',
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

  it('missing MSSQL config -> clear ImpactMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            S3_RESULTS_BUCKET: 'b',
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.equal(err.name, 'ImpactMssqlConfigError');
        assert.equal(err.code, 'impact_mssql_missing_config');
        assert.match(String(err.message), /MSSQL_SERVER/);
        return true;
      },
    );
  });

  it('defaultQueryParts is not an unconditional empty array', async () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'local',
        'impact',
        'src',
        'queryParts.js',
      ),
      'utf8',
    );
    assert.match(src, /dbo\.Parts/);
    assert.match(src, /mssql/);
    assert.ok(
      !/async function defaultQueryParts\([^)]*\) \{\s*return \[\];\s*\}/.test(
        src,
      ),
    );
  });

  it('worker.js has no message-only stub return', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'local',
        'impact',
        'src',
        'worker.js',
      ),
      'utf8',
    );
    assert.doesNotMatch(src, /MSSQL Parts SELECT not wired yet/);
    assert.match(src, /writeResults/);
    assert.match(src, /products/);
    assert.match(src, /normalizeProduct/);
    assert.match(src, /assertProductSchema/);
    assert.doesNotMatch(src, /^\s*stock:/m);
    assert.doesNotMatch(src, /^\s*feedKey:/m);
  });

  it('searchTextFromMsg prefers q then searchterms', () => {
    assert.equal(searchTextFromMsg({ q: '  phones ' }), 'phones');
    assert.equal(
      searchTextFromMsg({ searchterms: ['noise', 'cancelling'] }),
      'noise cancelling',
    );
  });

  it('mssqlConfigFromEnv requires server+database', () => {
    assert.throws(
      () => mssqlConfigFromEnv({ MSSQL_USER: 'u' }),
      ImpactMssqlConfigError,
    );
  });

  it('SELECT pins Source=impact and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source = N'impact'/);
    assert.match(SELECT_SQL, /DeletedAt IS NULL/);
    assert.match(SELECT_SQL, /Title LIKE @like/);
  });

  it('defaultQueryParts uses injected connect and closes pool', async () => {
    let closed = false;
    const pool = mockPool([
      {
        Source: 'impact',
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
    assert.equal(pool._inputs.env, 'sandbox');
    assert.equal(pool._inputs.q, 'headphones');
    assert.match(pool._inputs.like, /headphones/);
  });
});
