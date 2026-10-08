'use strict';

/**
 * MRB #809 hostile pins for FR-095 flexoffers queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  FlexoffersMssqlConfigError,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  SELECT_SQL,
} = require('../providers/local/flexoffers/src/queryParts');
const { run, normalizePart } = require('../providers/local/flexoffers/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  FLEXOFFERS_AFFILIATE_ID: 'fo-aff-hostile',
};

describe('MRB-809 FR-095 hostile', () => {
  it('registry flexoffers stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const fo = registry.sources.find((s) => s.id === 'flexoffers');
    assert.ok(fo);
    assert.equal(fo.enabled.live, false);
    assert.equal(fo.enabled.sandbox, false);
    assert.equal(fo.kind, 'local');
    assert.equal(fo.queueEnv, 'SQS_FLEXOFFERS_URL');
  });

  it('SELECT_SQL pins Source=flexoffers and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'flexoffers'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws FlexoffersMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () => defaultQueryParts({ env: 'sandbox', q: 'x' }, { env: { A_SEARCH_ENV: 'sandbox' } }),
      (err) => {
        assert.ok(err instanceof FlexoffersMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> normalizePart -> writeResults with foid track', async () => {
    const puts = [];
    const row = {
      Source: 'flexoffers',
      FeedKey: 'prog1',
      MerchantProductId: 'sku-1',
      Env: 'sandbox',
      Title: 'Boot',
      Description: 'desc',
      Url: 'https://merchant.example/p/1',
      ImageUrl: 'https://cdn.example/1.jpg',
      Price: 12.5,
      Currency: 'GBP',
      Stock: 'in_stock',
    };
    const result = await run(
      {
        env: 'sandbox',
        userId: 'u1',
        catalogId: 'c1',
        searchId: 's1',
        q: 'boot',
        source: 'flexoffers',
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
    assert.equal(result.source, 'flexoffers');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /foid=fo-aff-hostile/);
    assert.equal(puts.length, 1);
  });

  it('normalizePart requires track context for Url', () => {
    assert.throws(
      () =>
        normalizePart({
          MerchantProductId: '1',
          Title: 't',
          Url: 'https://example.invalid/p',
        }),
      /track context/,
    );
  });

  it('searchTextFromMsg prefers q then searchterms', () => {
    assert.equal(searchTextFromMsg({ q: 'a', searchterms: 'b' }), 'a');
    assert.equal(searchTextFromMsg({ searchterms: 'b' }), 'b');
  });

  it('mssqlConfigFromEnv requires server+database+user (or trusted)', () => {
    assert.throws(() => mssqlConfigFromEnv({ MSSQL_SERVER: 'x' }), FlexoffersMssqlConfigError);
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 's',
      MSSQL_DATABASE: 'd',
      MSSQL_USER: 'u',
      MSSQL_PASSWORD: 'p',
    });
    assert.equal(cfg.server, 's');
    assert.equal(cfg.database, 'd');
  });

  it('worker source no longer contains not-wired stub', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'flexoffers', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill documents FR-095 queryParts stay-dark; .env.example secrets empty', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'flexoffers',
        '.grok',
        'skills',
        'a-search-flexoffers',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-095/);
    assert.match(skill, /queryParts|defaultQueryParts/i);
    assert.match(skill, /stay-dark|enabled.*false/i);
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'flexoffers', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.match(envEx, /^FLEXOFFERS_AFFILIATE_ID=\s*$/m);
    assert.doesNotMatch(envEx, /MSSQL_PASSWORD=\S+/);
  });
});
