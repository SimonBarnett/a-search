'use strict';

/**
 * MRB #835 hostile pins for FR-083 partnerize queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  PartnerizeMssqlConfigError,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  SELECT_SQL,
} = require('../providers/local/partnerize/src/queryParts');
const { run, normalizePart } = require('../providers/local/partnerize/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  PARTNERIZE_PUBLISHER_ID: 'pz-pub-hostile',
};

describe('MRB-835 FR-083 hostile', () => {
  it('registry partnerize stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const pz = registry.sources.find((s) => s.id === 'partnerize');
    assert.ok(pz);
    assert.equal(pz.enabled.live, false);
    assert.equal(pz.enabled.sandbox, false);
    assert.equal(pz.kind, 'local');
    assert.equal(pz.queueEnv, 'SQS_PARTNERIZE_URL');
  });

  it('SELECT_SQL pins Source=partnerize and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'partnerize'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws PartnerizeMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () =>
        defaultQueryParts(
          { env: 'sandbox', q: 'x' },
          { env: { A_SEARCH_ENV: 'sandbox' } },
        ),
      (err) => {
        assert.ok(err instanceof PartnerizeMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> normalizePart -> writeResults with pubref track', async () => {
    const puts = [];
    const row = {
      Source: 'partnerize',
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
        source: 'partnerize',
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
    assert.equal(result.source, 'partnerize');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /pubref=pz-pub-hostile/);
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
      PartnerizeMssqlConfigError,
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
      path.join(root, 'providers', 'local', 'partnerize', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill documents FR-083 queryParts stay-dark; prior FR-084/085 kept; .env secrets empty', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'partnerize',
        '.grok',
        'skills',
        'a-search-partnerize',
        'SKILL.md',
      ),
      'utf8',
    );
    assert.match(skill, /FR-083/);
    assert.match(skill, /queryParts|defaultQueryParts|Worker \+ queryParts/i);
    assert.match(skill, /## Selftest \+ pacing \(FR-084\)/);
    assert.match(skill, /## Maintainer feed-parser \(FR-085\)/);
    assert.match(skill, /stay-dark|enabled.*false/i);
    assert.ok(!skill.includes('\ufffd'));
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'partnerize', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /^MSSQL_PASSWORD=\s*$/m);
    assert.match(envEx, /^PARTNERIZE_PUBLISHER_ID=\s*$/m);
    assert.match(envEx, /^PARTNERIZE_API_TOKEN=\s*$/m);
    assert.doesNotMatch(envEx, /MSSQL_PASSWORD=\S+/);
  });
});
