'use strict';

/**
 * MRB #727 hostile pins for FR-086 webgains queryParts + worker (stay-dark).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  defaultQueryParts,
  WebgainsMssqlConfigError,
  searchTextFromMsg,
  mssqlConfigFromEnv,
  SELECT_SQL,
} = require('../providers/local/webgains/src/queryParts');
const { run, normalizePart } = require('../providers/local/webgains/src/worker');

const mssqlEnv = {
  A_SEARCH_ENV: 'sandbox',
  MSSQL_SERVER: 'sql.test',
  MSSQL_DATABASE: 'a_search_sandbox',
  MSSQL_USER: 'app',
  MSSQL_PASSWORD: 'x',
  S3_RESULTS_BUCKET: 'test-results',
  WEBGAINS_CAMPAIGN_ID: 'wg-camp-hostile',
};

describe('MRB-727 FR-086 hostile', () => {
  it('registry webgains stay-dark both envs (CAST IRON)', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const wg = registry.sources.find((s) => s.id === 'webgains');
    assert.ok(wg);
    assert.equal(wg.enabled.live, false);
    assert.equal(wg.enabled.sandbox, false);
    assert.equal(wg.kind, 'local');
    assert.equal(wg.queueEnv, 'SQS_WEBGAINS_URL');
  });

  it('SELECT_SQL pins Source=webgains and DeletedAt IS NULL', () => {
    assert.match(SELECT_SQL, /Source\s*=\s*N'webgains'/i);
    assert.match(SELECT_SQL, /DeletedAt\s+IS\s+NULL/i);
    assert.match(SELECT_SQL, /dbo\.Parts/i);
  });

  it('missing MSSQL config throws WebgainsMssqlConfigError (not silent [])', async () => {
    await assert.rejects(
      () => defaultQueryParts({ env: 'sandbox', q: 'x' }, { env: { A_SEARCH_ENV: 'sandbox' } }),
      (err) => {
        assert.ok(err instanceof WebgainsMssqlConfigError);
        assert.match(String(err.message), /MSSQL/i);
        return true;
      },
    );
  });

  it('worker run: queryParts -> normalizePart -> writeResults with campaign track', async () => {
    const puts = [];
    const row = {
      Source: 'webgains',
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
        source: 'webgains',
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
    assert.equal(result.source, 'webgains');
    assert.equal(result.products.length, 1);
    assert.match(String(result.products[0].url), /wgcampaignid=wg-camp-hostile/);
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
    assert.throws(() => mssqlConfigFromEnv({ MSSQL_SERVER: 'x' }), WebgainsMssqlConfigError);
    assert.throws(
      () => mssqlConfigFromEnv({ MSSQL_SERVER: 's', MSSQL_DATABASE: 'd' }),
      WebgainsMssqlConfigError,
    );
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 's',
      MSSQL_DATABASE: 'd',
      MSSQL_USER: 'u',
      MSSQL_PASSWORD: 'p',
    });
    assert.equal(cfg.server, 's');
    assert.equal(cfg.database, 'd');
    assert.equal(cfg.user, 'u');
  });

  it('worker source no longer contains not-wired stub', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'local', 'webgains', 'src', 'worker.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /not-wired/i);
    assert.match(src, /defaultQueryParts/);
    assert.match(src, /writeResults/);
  });

  it('skill / AGENTS document FR-086 queryParts stay-dark', () => {
    const skill = fs.readFileSync(
      path.join(
        root,
        'providers',
        'local',
        'webgains',
        '.grok',
        'skills',
        'a-search-webgains',
        'SKILL.md',
      ),
      'utf8',
    );
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'local', 'webgains', 'AGENTS.md'),
      'utf8',
    );
    assert.match(skill, /FR-086|queryParts/);
    assert.match(skill, /enabled\.live\s*=\s*false|stay-dark|stay dark/i);
    assert.match(agents, /queryParts|FR-086/);
  });

  it('.env.example has MSSQL + WEBGAINS_CAMPAIGN_ID placeholders without secrets', () => {
    const envEx = fs.readFileSync(
      path.join(root, 'providers', 'local', 'webgains', '.env.example'),
      'utf8',
    );
    assert.match(envEx, /MSSQL_SERVER=/);
    assert.match(envEx, /MSSQL_DATABASE=/);
    assert.match(envEx, /WEBGAINS_CAMPAIGN_ID=/);
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
