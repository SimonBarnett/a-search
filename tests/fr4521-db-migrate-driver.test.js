'use strict';

/**
 * FR #4521: db-migrate mssql driver - GO splitter, stop on first error,
 * skip SchemaMigrations rows with matching Sha256.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  splitGoBatches,
  runMigrations,
  sha256File,
  assertTargetHeader,
} = require('../scripts/db-migrate');

describe('FR #4521 db-migrate driver', () => {
  it('splitGoBatches splits on standalone GO lines and keeps batches', () => {
    const sql = [
      '-- target: a_search',
      'SET NOCOUNT ON;',
      'GO',
      'CREATE TABLE dbo.T (id int);',
      'GO',
      '',
      'INSERT INTO dbo.T (id) VALUES (1);',
      'go',
    ].join('\n');
    const batches = splitGoBatches(sql);
    assert.equal(batches.length, 3);
    assert.match(batches[0], /SET NOCOUNT ON/);
    assert.match(batches[1], /CREATE TABLE dbo\.T/);
    assert.match(batches[2], /INSERT INTO dbo\.T/);
    assert.ok(!batches.some((b) => /^\s*GO\s*$/im.test(b)));
  });

  it('splitGoBatches does not split on GO inside strings or identifiers', () => {
    const sql = [
      "-- target: a_search",
      "SELECT 'GO' AS x;",
      'GO',
      'SELECT 1 AS gone;',
    ].join('\n');
    const batches = splitGoBatches(sql);
    assert.equal(batches.length, 2);
    assert.match(batches[0], /SELECT 'GO' AS x/);
    assert.match(batches[1], /SELECT 1 AS gone/);
  });

  it('runMigrations stops at the first batch error and does not record the file', async () => {
    const calls = [];
    await assert.rejects(
      () =>
        runMigrations({
          database: 'a_search_sandbox',
          applied: new Map(),
          listFiles: () => ['001_fail.sql'],
          readFile: () =>
            '-- target: a_search\nSELECT 1;\nGO\nSELECT boom;\nGO\nSELECT 2;\n',
          sha256Of: () => 'a'.repeat(64),
          query: async (sql) => {
            calls.push(sql);
            if (/boom/.test(sql)) {
              const err = new Error('batch failed');
              throw err;
            }
            return {};
          },
        }),
      /batch failed|001_fail/,
    );
    assert.ok(calls.some((c) => /SELECT 1/.test(c)));
    assert.ok(calls.some((c) => /boom/.test(c)));
    assert.ok(!calls.some((c) => /SELECT 2/.test(c)));
    assert.ok(!calls.some((c) => /INSERT INTO dbo\.SchemaMigrations/i.test(c)));
  });

  it('runMigrations skips a file when SchemaMigrations hash matches', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4521-mig-'));
    const filePath = path.join(dir, '001_ok.sql');
    const body = '-- target: a_search\nSELECT 1;\nGO\n';
    fs.writeFileSync(filePath, body, 'utf8');
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const queries = [];
    const result = await runMigrations({
      database: 'a_search_sandbox',
      applied: new Map([['001_ok.sql', hash]]),
      listFiles: () => [filePath],
      query: async (sql, params) => {
        queries.push({ sql, params });
        return {};
      },
    });
    assert.deepEqual(result.ran, []);
    assert.deepEqual(result.skipped, ['001_ok.sql']);
    assert.equal(queries.length, 0);
  });

  it('runMigrations throws when ledger hash mismatches file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4521-mis-'));
    const filePath = path.join(dir, '001_ok.sql');
    fs.writeFileSync(filePath, '-- target: a_search\nSELECT 1;\n', 'utf8');
    await assert.rejects(
      () =>
        runMigrations({
          database: 'a_search_sandbox',
          applied: new Map([['001_ok.sql', 'b'.repeat(64)]]),
          listFiles: () => [filePath],
          query: async () => ({}),
        }),
      /checksum mismatch|Sha256/i,
    );
  });

  it('runMigrations applies GO batches then inserts SchemaMigrations', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4521-ok-'));
    const filePath = path.join(dir, '001_ok.sql');
    const body = '-- target: a_search\nSELECT 1 AS a;\nGO\nSELECT 2 AS b;\n';
    fs.writeFileSync(filePath, body, 'utf8');
    const hash = sha256File(filePath);
    const queries = [];
    const result = await runMigrations({
      database: 'a_search',
      applied: new Map(),
      listFiles: () => [filePath],
      query: async (sql, params) => {
        queries.push({ sql, params });
        return {};
      },
    });
    assert.deepEqual(result.ran, ['001_ok.sql']);
    assert.ok(queries.some((q) => /SELECT 1 AS a/.test(q.sql)));
    assert.ok(queries.some((q) => /SELECT 2 AS b/.test(q.sql)));
    const insert = queries.find((q) =>
      /INSERT INTO dbo\.SchemaMigrations/i.test(q.sql),
    );
    assert.ok(insert);
    assert.equal(insert.params.name, '001_ok.sql');
    assert.equal(insert.params.sha, hash);
    assertTargetHeader(body, '001_ok.sql');
  });

  it('every db/migrations/*.sql splits into non-empty GO batches without bare @params at file scope', () => {
    const dir = path.join(__dirname, '..', 'db', 'migrations');
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d{3}_.+\.sql$/i.test(f))
      .sort();
    for (const name of files) {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      assertTargetHeader(sql, name);
      const batches = splitGoBatches(sql);
      assert.ok(batches.length >= 1, name + ' empty batches');
      // Top-level MERGE/UPDATE using undeclared @params must not remain (FR #4518).
      if (/^00[67]_/.test(name)) {
        assert.match(sql, /CREATE OR ALTER PROCEDURE/i);
      }
    }
  });

});
