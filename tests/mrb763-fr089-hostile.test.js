'use strict';

/**
 * MRB #763 hostile pins for FR-089 tradedoubler queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  TradedoublerMssqlConfigError,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  SELECT_SQL,
} = require('../providers/local/tradedoubler/src/queryParts');
const { run, normalizePart } = require('../providers/local/tradedoubler/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  TRADEDOUBLER_AFFILIATE_ID: 'td-aff-hostile',
};

describe('MRB-763 FR-089 hostile', () => {
  it('registry tradedoubler stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const td = registry.sources.find((s) => s.id === 'tradedoubler');
    assert.ok(td);
    assert.equal(td.enabled.live, false);
    assert.equal(td.enabled.sandbox, false);
    assert.equal(td.kind, 'local');
    assert.equal(td.queueEnv, 'SQS_TRADEDOUBLER_URL');
  });

  it('SELECT_SQL pins Source=tradedoubler and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'tradedoubler'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws TradedoublerMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () => defaultQueryParts({ env: 'sandbox', q: 'x' }, { env: { A_SEARCH_ENV: 'sandbox' } }),
      (err) => {
        assert.ok(err instanceof TradedoublerMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> normalizePart -> writeResults with tduid track', async () => {
    const puts = [];
    const row = {
      Source: 'tradedoubler',
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
        source: 'tradedoubler',
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
    assert.equal(result.source, 'tradedoubler');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /tduid=td-aff-hostile/);
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
    assert.throws(() => mssqlConfigFromEnv({ MSSQL_SERVER: 'x' }), TradedoublerMssqlConfigError);
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
      path.join(root, 'providers', 'local', 'tradedoubler', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill documents FR-089 queryParts stay-dark; AGENTS no longer stubs worker', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'tradedoubler',
        '.grok',
        'skills',
        'a-search-tradedoubler',
        'SKILL.md',
      ),
      'utf8',
    );
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'local', 'tradedoubler', 'AGENTS.md'),
      'utf8',
    );
    assert.match(skill, /FR-089|queryParts/);
    assert.match(skill, /enabled\.live\s*=\s*false|stay-dark|stay dark/i);
    assert.doesNotMatch(agents, /worker\.js.*stub/i);
    assert.match(agents, /queryParts|FR-089|writeResults/);
  });

  it('.env.example has MSSQL + TRADEDOUBLER_AFFILIATE_ID placeholders without secrets', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'tradedoubler', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /MSSQL_SERVER=/);
    assert.match(envEx, /MSSQL_DATABASE=/);
    assert.match(envEx, /TRADEDOUBLER_AFFILIATE_ID=/);
    for (const line of envEx.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const val = line.slice(eq + 1).trim();
      assert.ok(
        val === '' || /example|placeholder|changeme|your-/i.test(val) || !/sk-|secret|password/i.test(val),
        `suspicious env value: ${line}`,
      );
    }
  });
});
