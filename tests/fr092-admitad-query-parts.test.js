'use strict';

/** FR-092: admitad MSSQL queryParts + writeResults (stay-dark). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  run,
  AdmitadMssqlConfigError,
} = require('../providers/local/admitad/src/worker');
const {
  defaultQueryParts,
  mssqlConfigFromEnv,
  searchTextFromMsg,
  SELECT_SQL,
} = require('../providers/local/admitad/src/queryParts');
const { resultsKey } = require('../shared/resultsPath');

const root = path.join(__dirname, '..');

const baseMsg = {
  searchId: 'srch_admitad_92',
  userId: 'U-AD',
  env: 'sandbox',
  source: 'admitad',
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
  ADMITAD_WEBSITE_ID: 'ad-web-test',
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
          assert.match(sqlText, /Source = N'admitad'/);
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

describe('FR-092 admitad MSSQL queryParts', () => {
  it('mock connection rows -> normalized products + writeResults', async () => {
    const rows = [
      {
        Source: 'admitad',
        FeedKey: 'prog1',
        MerchantProductId: 'sku-100',
        Env: 'sandbox',
        Title: 'Mock Admitad Headphones',
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
    assert.equal(out.source, 'admitad');
    assert.ok(Array.isArray(out.products));
    assert.equal(out.products.length, 1);
    assert.equal(out.products[0].id, 'sku-100');
    assert.equal(out.products[0].title, 'Mock Admitad Headphones');
    assert.equal(out.products[0].description, 'noise cancelling');
    assert.equal(out.products[0].price, 19.99);
    assert.equal(out.products[0].source, 'admitad');
    assert.deepEqual(out.products[0].raw, {
      feedKey: 'prog1',
      stock: 'in_stock',
    });
    assert.match(String(out.products[0].url), /tag=ad-web-test/);
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
        source: 'admitad',
        userId: 'U-AD',
        catalogId: 7,
        searchId: 'srch_admitad_92',
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

  it('missing MSSQL config -> clear AdmitadMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () =>
        run(baseMsg, {
          env: {
            A_SEARCH_ENV: 'sandbox',
            S3_RESULTS_BUCKET: 'b',
            ADMITAD_WEBSITE_ID: 'ad',
          },
          putObject: async () => {
            throw new Error('should not put');
          },
        }),
      (err) => {
        assert.equal(err.name, 'AdmitadMssqlConfigError');
        assert.equal(err.code, 'admitad_mssql_missing_config');
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
      path.join(root, 'providers', 'local', 'admitad', 'src', 'worker.js'),
      'utf8',
    );
    assert.ok(!/not wired yet/i.test(src));
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('defaultQueryParts is not an unconditional empty array', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'admitad', 'src', 'queryParts.js'),
      'utf8',
    );
    assert.match(src, /dbo\.Parts/);
    assert.match(src, /mssql/);
    assert.ok(
      !/async function defaultQueryParts\([^)]*\) \{\s*return \[\];\s*\}/.test(src),
    );
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
      AdmitadMssqlConfigError,
    );
  });

  it('SELECT pins Source=admitad and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source = N'admitad'/);
    assert.match(SELECT_SQL, /DeletedAt IS NULL/);
    assert.match(SELECT_SQL, /Title LIKE @like/);
  });

  it('defaultQueryParts uses injected connect and closes pool', async () => {
    let closed = false;
    const pool = mockPool([
      {
        Source: 'admitad',
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

  it('registry keeps admitad enabled false both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const wg = registry.sources.find((s) => s.id === 'admitad');
    assert.ok(wg);
    assert.equal(wg.enabled.live, false);
    assert.equal(wg.enabled.sandbox, false);
  });
});
