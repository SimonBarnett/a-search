'use strict';

/**
 * MRB #820 hostile pins for FR-098 avantlink queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  AvantlinkMssqlConfigError,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  SELECT_SQL,
} = require('../providers/local/avantlink/src/queryParts');
const { run, normalizePart } = require('../providers/local/avantlink/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  AVANTLINK_AFFILIATE_ID: 'al-aff-hostile',
};

describe('MRB-820 FR-098 hostile', () => {
  it('registry avantlink stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const al = registry.sources.find((s) => s.id === 'avantlink');
    assert.ok(al);
    assert.equal(al.enabled.live, false);
    assert.equal(al.enabled.sandbox, false);
    assert.equal(al.kind, 'local');
    assert.equal(al.queueEnv, 'SQS_AVANTLINK_URL');
  });

  it('SELECT_SQL pins Source=avantlink and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'avantlink'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws AvantlinkMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () =>
        defaultQueryParts(
          { env: 'sandbox', q: 'x' },
          { env: { A_SEARCH_ENV: 'sandbox' } },
        ),
      (err) => {
        assert.ok(err instanceof AvantlinkMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> normalizePart -> writeResults with avad track', async () => {
    const puts = [];
    const row = {
      Source: 'avantlink',
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
        source: 'avantlink',
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
    assert.equal(result.source, 'avantlink');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /avad=al-aff-hostile/);
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
    assert.throws(
      () => mssqlConfigFromEnv({ MSSQL_SERVER: 'x' }),
      AvantlinkMssqlConfigError,
    );
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
      path.join(root, 'providers', 'local', 'avantlink', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill documents FR-098 queryParts stay-dark; .env.example secrets empty', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'avantlink',
        '.grok',
        'skills',
        'a-search-avantlink',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-098/);
    assert.match(skill, /queryParts|defaultQueryParts/i);
    assert.match(skill, /stay-dark|enabled.*false/i);
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'avantlink', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.match(envEx, /^AVANTLINK_AFFILIATE_ID=\s*$/m);
    assert.doesNotMatch(envEx, /MSSQL_PASSWORD=\S+/);
  });
});
