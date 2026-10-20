'use strict';

/**
 * FR #4520: mssql store for walrus daily import (upsert + delete-missing).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const {
  createSqlStore,
  mssqlConfigFromEnv,
  SqlStoreConfigError,
} = require('../walrus/import/src/sqlStore');
const { parseArgs } = require('../walrus/import/cli');

/**
 * In-memory SQL stub that understands the statements sqlStore issues.
 */
function createStubExec() {
  /** @type {Map<string, object>} */
  const parts = new Map();
  /** @type {object[]} */
  const staging = [];
  /** @type {Map<string, object>} */
  const files = new Map();
  /** @type {object[]} */
  const failures = [];
  let runSeq = 0;
  let appLock = false;

  function partKey(source, feed, mpid, env) {
    return `${source}|${feed}|${mpid}|${env}`;
  }

  async function exec(sqlText, inputs = {}) {
    const sql = String(sqlText);

    if (sql.includes('sp_getapplock')) {
      if (appLock) return { recordset: [{ LockResult: -1 }] };
      appLock = true;
      return { recordset: [{ LockResult: 0 }] };
    }
    if (sql.includes('sp_releaseapplock')) {
      appLock = false;
      return { recordset: [] };
    }
    if (sql.includes('INSERT INTO ingest.ImportRuns')) {
      runSeq += 1;
      return { recordset: [{ RunId: runSeq }] };
    }
    if (sql.includes('DELETE FROM ingest.PartsStaging')) {
      for (let i = staging.length - 1; i >= 0; i -= 1) {
        const r = staging[i];
        if (
          r.RunId === inputs.RunId &&
          r.ProviderId === inputs.ProviderId &&
          r.FeedKey === inputs.FeedKey &&
          r.Env === inputs.Env
        ) {
          staging.splice(i, 1);
        }
      }
      return { recordset: [] };
    }
    if (sql.includes('INSERT INTO ingest.PartsStaging')) {
      staging.push({ ...inputs });
      return { recordset: [] };
    }
    if (sql.includes('MERGE dbo.Parts')) {
      let inserted = 0;
      let updated = 0;
      const slice = staging.filter(
        (r) =>
          r.RunId === inputs.RunId &&
          r.ProviderId === inputs.ProviderId &&
          r.FeedKey === inputs.FeedKey &&
          r.Env === inputs.Env,
      );
      for (const s of slice) {
        const k = partKey(s.ProviderId, s.FeedKey, s.MerchantProductId, s.Env);
        const prev = parts.get(k);
        const row = {
          Source: s.ProviderId,
          FeedKey: s.FeedKey,
          MerchantProductId: String(s.MerchantProductId),
          Env: s.Env,
          Class: s.Class,
          Title: s.Title,
          Description: s.Description,
          Brand: s.Brand,
          Category: s.Category,
          Url: s.Url,
          ImageUrl: s.ImageUrl,
          Price: s.Price,
          Currency: s.Currency,
          Gtin: s.Gtin,
          Ean: s.Ean,
          Mpn: s.Mpn,
          Availability: s.Availability,
          ContentHash: s.ContentHash,
          DeletedAt: null,
          LastSeenRunId: s.RunId,
        };
        if (!prev || prev.DeletedAt) inserted += 1;
        else if (prev.ContentHash !== s.ContentHash) updated += 1;
        parts.set(k, row);
      }
      return { recordset: [{ MergeRows: inserted + updated }], inserted, updated };
    }
    if (sql.includes('UPDATE T') && sql.includes('DeletedAt')) {
      let deleted = 0;
      for (const [k, row] of [...parts.entries()]) {
        if (
          row.Source === inputs.ProviderId &&
          row.FeedKey === inputs.FeedKey &&
          row.Env === inputs.Env &&
          !row.DeletedAt
        ) {
          const inStaging = staging.some(
            (s) =>
              s.RunId === inputs.RunId &&
              s.ProviderId === row.Source &&
              s.FeedKey === row.FeedKey &&
              s.MerchantProductId === row.MerchantProductId &&
              s.Env === row.Env,
          );
          if (!inStaging) {
            parts.set(k, { ...row, DeletedAt: new Date().toISOString() });
            deleted += 1;
          }
        }
      }
      return { recordset: [{ Deleted: deleted }] };
    }
    if (sql.includes('DELETE T') && sql.includes('dbo.Parts')) {
      let deleted = 0;
      for (const [k, row] of [...parts.entries()]) {
        if (
          row.Source === inputs.ProviderId &&
          row.FeedKey === inputs.FeedKey &&
          row.Env === inputs.Env
        ) {
          const inStaging = staging.some(
            (s) =>
              s.RunId === inputs.RunId &&
              s.ProviderId === row.Source &&
              s.FeedKey === row.FeedKey &&
              s.MerchantProductId === row.MerchantProductId &&
              s.Env === row.Env,
          );
          if (!inStaging) {
            parts.delete(k);
            deleted += 1;
          }
        }
      }
      return { recordset: [{ Deleted: deleted }] };
    }
    if (sql.includes('DELETE FROM dbo.Parts') && sql.includes('Source = @ProviderId')) {
      let n = 0;
      for (const [k, row] of [...parts.entries()]) {
        if (
          row.Source === inputs.ProviderId &&
          row.FeedKey === inputs.FeedKey &&
          row.Env === inputs.Env
        ) {
          parts.delete(k);
          n += 1;
        }
      }
      return { recordset: [{ N: n }] };
    }
    if (sql.includes('FROM dbo.Parts') && sql.includes('DeletedAt IS NULL') && sql.includes('SELECT Source')) {
      const rows = [];
      for (const row of parts.values()) {
        if (
          row.Source === inputs.Source &&
          row.FeedKey === inputs.FeedKey &&
          row.Env === inputs.Env &&
          !row.DeletedAt
        ) {
          rows.push(row);
        }
      }
      return { recordset: rows };
    }
    if (sql.includes('MERGE ingest.ImportFiles') || sql.includes('INSERT') && sql.includes('ImportFiles')) {
      files.set(`${inputs.FileKey}|${inputs.Version}`, {
        Status: 'ok',
        ProviderId: inputs.ProviderId,
        FeedKey: inputs.FeedKey,
      });
      return { recordset: [] };
    }
    if (sql.includes('FROM ingest.ImportFiles')) {
      const row = files.get(`${inputs.FileKey}|${inputs.Version}`);
      return { recordset: row ? [{ Status: row.Status }] : [] };
    }
    if (sql.includes('INSERT INTO ingest.Failures')) {
      failures.push(inputs);
      return { recordset: [] };
    }
    if (sql.includes('FROM ingest.PurgeRequests')) {
      return { recordset: [] };
    }
    if (sql.includes('Title LIKE')) {
      for (const row of parts.values()) {
        if (
          row.Source === inputs.ProviderId &&
          row.FeedKey === inputs.FeedKey &&
          row.Env === inputs.Env &&
          !row.DeletedAt &&
          String(row.Title || '').includes(String(inputs.Like || '').replace(/%/g, ''))
        ) {
          return { recordset: [{ Hit: 1 }] };
        }
      }
      return { recordset: [] };
    }
    throw new Error(`stub_unhandled_sql:${sql.slice(0, 80)}`);
  }

  return { exec, parts, staging, files, failures, get appLock() { return appLock; } };
}

describe('FR #4520 sqlStore config', () => {
  it('mssqlConfigFromEnv refuses madeiradb', () => {
    assert.throws(
      () =>
        mssqlConfigFromEnv({
          MSSQL_SERVER: 'walrus\\ASEARCH',
          MSSQL_DATABASE: 'madeiradb',
          MSSQL_USER: 'u',
          MSSQL_PASSWORD: 'FAKE_pw',
        }),
      (err) => err && err.code === 'madeiradb_read_only',
    );
  });

  it('mssqlConfigFromEnv requires server+database+user (or trusted)', () => {
    assert.throws(
      () => mssqlConfigFromEnv({ MSSQL_SERVER: 'x' }),
      SqlStoreConfigError,
    );
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search_sandbox',
      MSSQL_USER: 'import',
      MSSQL_PASSWORD: 'FAKE_pw',
    });
    assert.equal(cfg.database, 'a_search_sandbox');
    assert.equal(cfg.user, 'import');
  });
});

describe('FR #4520 sqlStore upsert + delete-missing', () => {
  it('mergeFeed upserts then soft-deletes missing (stubbed SQL)', async () => {
    const stub = createStubExec();
    const store = createSqlStore({
      env: 'sandbox',
      database: 'a_search_sandbox',
      envVars: {
        MSSQL_SERVER: 'stub',
        MSSQL_DATABASE: 'a_search_sandbox',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'FAKE_pw',
      },
      exec: stub.exec,
    });

    assert.equal(await store.tryAppLock(), true);
    const run = await store.beginRun('run');
    assert.equal(run.runId, 1);

    const r1 = await store.mergeFeed({
      runId: run.runId,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      deleteMissing: 'soft',
      staged: [
        {
          MerchantProductId: 'A1',
          title: 'Part One',
          ContentHash: 'h1',
          rowNum: 1,
        },
        {
          MerchantProductId: 'A2',
          title: 'Part Two',
          ContentHash: 'h2',
          rowNum: 2,
        },
      ],
    });
    assert.equal(r1.inserted, 2);
    assert.equal(r1.updated, 0);
    assert.equal(r1.deleted, 0);
    assert.equal((await store.listActive('awin', '1902')).length, 2);

    const r2 = await store.mergeFeed({
      runId: run.runId,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      deleteMissing: 'soft',
      staged: [
        {
          MerchantProductId: 'A1',
          title: 'Part One v2',
          ContentHash: 'h1b',
          rowNum: 1,
        },
      ],
    });
    assert.equal(r2.inserted, 0);
    assert.equal(r2.updated, 1);
    assert.equal(r2.deleted, 1);
    const active = await store.listActive('awin', '1902');
    assert.equal(active.length, 1);
    assert.equal(active[0].MerchantProductId, 'A1');
    assert.equal(active[0].ContentHash, 'h1b');

    // MERGE path must target ingest staging + dbo.Parts (never madeiradb)
    assert.equal(stub.staging.every((s) => s.Env === 'sandbox'), true);
    await store.releaseAppLock();
  });

  it('dry-run does not write Parts', async () => {
    const stub = createStubExec();
    const store = createSqlStore({
      env: 'sandbox',
      database: 'a_search_sandbox',
      envVars: {
        MSSQL_SERVER: 'stub',
        MSSQL_DATABASE: 'a_search_sandbox',
        MSSQL_USER: 'u',
        MSSQL_PASSWORD: 'FAKE_pw',
      },
      exec: stub.exec,
    });
    const run = await store.beginRun('dry-run');
    const r = await store.mergeFeed({
      runId: run.runId,
      providerId: 'awin',
      feedKey: '1902',
      className: 'affiliate',
      deleteMissing: 'soft',
      dryRun: true,
      staged: [{ MerchantProductId: 'X', title: 'x', ContentHash: 'hx', rowNum: 1 }],
    });
    assert.equal(r.wouldInsert, 1);
    assert.equal(r.inserted, 0);
    assert.equal(stub.parts.size, 0);
  });
});

describe('FR #4520 cli + register wiring', () => {
  it('cli selects SQL store unless IMPORT_MEMORY=1', () => {
    const src = fs.readFileSync(path.join(ROOT, 'walrus', 'import', 'cli.js'), 'utf8');
    assert.match(src, /createSqlStore/);
    assert.match(src, /IMPORT_MEMORY\s*===\s*['"]1['"]/);
    assert.doesNotMatch(src, /createMemoryStore\(\{[\s\S]*\}\)\s*:\s*createMemoryStore/);
    const bothMemory = /IMPORT_MEMORY[\s\S]{0,200}createMemoryStore[\s\S]{0,80}createMemoryStore/;
    assert.equal(bothMemory.test(src), false, 'both branches must not be memory-only');
  });

  it('parseArgs still supports provider/feed/dry-run', () => {
    const o = parseArgs(['node', 'cli.js', 'run', '--provider', 'awin', '--feed', '1902', '--dry-run']);
    assert.equal(o.provider, 'awin');
    assert.equal(o.feed, '1902');
    assert.equal(o.dryRun, true);
  });

  it('Register-DailyImportTask.ps1 requires MSSQL params like #4515', () => {
    const ps = fs.readFileSync(
      path.join(ROOT, 'walrus', 'install', 'Register-DailyImportTask.ps1'),
      'utf8',
    );
    assert.match(ps, /MssqlServer/);
    assert.match(ps, /MssqlPasswordFile/);
    assert.match(ps, /madeiradb_read_only/);
    assert.match(ps, /MSSQL_SERVER/);
    assert.match(ps, /04:00/);
    assert.match(ps, /MultipleInstances IgnoreNew/);
  });
});
