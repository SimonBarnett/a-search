'use strict';

/**
 * FR #4518: every db/migrations/*.sql must apply as a migration batch
 * (no bare @Source/@FeedKey/@Env outside CREATE PROCEDURE).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  listMigrationFiles,
  assertTargetHeader,
  runMigrations,
} = require('../scripts/db-migrate');

const ROOT = path.join(__dirname, '..');
const MIG_DIR = path.join(ROOT, 'db', 'migrations');

/** Strip block and line comments (naive; good enough for migration gates). */
function stripSqlComments(sql) {
  return String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');
}

/**
 * Batches that are not CREATE/ALTER PROCEDURE must not reference undeclared
 * @Source / @FeedKey / @Env (FR #4518 class of walrus apply failure).
 */
function batchesWithBareFeedParams(sql) {
  const text = stripSqlComments(sql);
  const batches = text.split(/^\s*GO\s*$/im);
  const bad = [];
  for (const batch of batches) {
    const b = batch.trim();
    if (!b) continue;
    if (/^\s*CREATE\s+(OR\s+ALTER\s+)?PROCEDURE\b/i.test(b)) continue;
    if (/^\s*ALTER\s+PROCEDURE\b/i.test(b)) continue;
    if (/@(Source|FeedKey|Env)\b/i.test(b)) {
      bad.push(b.slice(0, 120).replace(/\s+/g, ' '));
    }
  }
  return bad;
}

describe('FR #4518 db/migrations apply-clean', () => {
  it('lists every numbered migration and each has -- target: a_search', () => {
    const files = listMigrationFiles(MIG_DIR);
    assert.ok(files.length >= 20, `expected many migrations, got ${files.length}`);
    for (const f of files) {
      const sql = fs.readFileSync(f, 'utf8');
      assertTargetHeader(sql, path.basename(f));
    }
  });

  it('no migration uses bare @Source/@FeedKey/@Env outside a PROCEDURE', () => {
    const files = listMigrationFiles(MIG_DIR);
    const failures = [];
    for (const f of files) {
      const name = path.basename(f);
      const bad = batchesWithBareFeedParams(fs.readFileSync(f, 'utf8'));
      if (bad.length) {
        failures.push(`${name}: ${bad[0]}`);
      }
    }
    assert.deepEqual(failures, [], failures.join('\n'));
  });

  it('006/007 create MergeParts and DeleteMissingParts procedures with params', () => {
    const merge = fs.readFileSync(
      path.join(MIG_DIR, '006_MergeParts.sql'),
      'utf8',
    );
    const del = fs.readFileSync(
      path.join(MIG_DIR, '007_DeleteMissingParts.sql'),
      'utf8',
    );
    assert.match(merge, /CREATE\s+OR\s+ALTER\s+PROCEDURE\s+dbo\.MergeParts/i);
    assert.match(merge, /@Source\s+nvarchar/i);
    assert.match(merge, /@FeedKey\s+nvarchar/i);
    assert.match(merge, /@Env\s+nvarchar/i);
    assert.match(merge, /\bMERGE\s+dbo\.Parts\b/i);
    assert.match(
      del,
      /CREATE\s+OR\s+ALTER\s+PROCEDURE\s+dbo\.DeleteMissingParts/i,
    );
    assert.match(del, /@Source\s+nvarchar/i);
    assert.match(del, /DeletedAt\s*=\s*SYSUTCDATETIME/i);
  });

  it('runMigrations on empty ledger applies every file once (mock driver)', async () => {
    // FR #4521 driver tracks ledger as Map(name -> sha); Set inject still skips by name.
    const applied = new Map();
    const ranSql = [];
    const { ran } = await runMigrations({
      database: 'a_search',
      applied,
      query: async (sql, params) => {
        ranSql.push({ sql: String(sql).slice(0, 80), params });
        return {};
      },
    });
    const names = listMigrationFiles(MIG_DIR).map((f) => path.basename(f));
    assert.deepEqual(ran, names);
    assert.equal(applied.size, names.length);
    // Second pass: nothing pending (walrus re-run leaves 000-005 etc alone).
    const second = await runMigrations({
      database: 'a_search',
      applied,
      query: async () => ({}),
    });
    assert.deepEqual(second.ran, []);
    assert.deepEqual(second.skipped, names);
  });
});
