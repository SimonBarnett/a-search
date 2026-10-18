'use strict';

/**
 * MRB #2209 hostile pins for FR-251 / #1365.
 * madeiradb hard-rejected even when allowlisted; fr251 suite loads without aws-cdk-lib;
 * migrations keep -- target: a_search; mdb views have no INSTEAD OF.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  assertAsearchDatabase,
  connectAsearchMssql,
  MssqlConnectError,
  DEFAULT_ALLOWLIST,
} = require('../shared/mssql/connect');
const { runMigrations, listMigrationFiles } = require('../scripts/db-migrate');

describe('MRB #2209 hostile FR-251 madeiradb', () => {
  it('hard-rejects madeiradb even when present in allowlist', () => {
    assert.throws(
      () => assertAsearchDatabase('MadeiraDB', { allowlist: ['MadeiraDB'] }),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    assert.deepEqual(DEFAULT_ALLOWLIST, ['a_search', 'a_search_sandbox']);
  });

  it('fr251 test file does not top-level require cdk stack (seat without aws-cdk-lib)', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'tests', 'fr251-madeiradb-readonly.test.js'),
      'utf8',
    );
    assert.doesNotMatch(
      text,
      /^(const|let|var)\s*\{[^}]*wireMssqlSecretEnv[^}]*\}\s*=\s*require\(\s*['\"]\.\.\/cdk\/lib\/a-search-stack['\"]/m,
    );
    assert.match(text, /STACK_PATH|readFileSync\(STACK_PATH/);
    assert.match(text, /MODULE_NOT_FOUND/);
  });

  it('db-migrate refuses madeiradb; every migration has target header; no INSTEAD OF', async () => {
    await assert.rejects(
      () => runMigrations({ database: 'madeiradb', query: async () => ({}) }),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    const files = listMigrationFiles();
    assert.ok(files.length >= 8);
    for (const f of files) {
      const sql = fs.readFileSync(f, 'utf8');
      const first = sql
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l.length > 0);
      assert.match(first, /^--\s*target:\s*a_search\b/i);
      assert.doesNotMatch(sql, /CREATE\s+TRIGGER[\s\S]{0,80}INSTEAD\s+OF/i);
    }
    const mdb = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '014_mdb_identity_views.sql'),
      'utf8',
    );
    assert.match(mdb, /CREATE VIEW mdb\.Users/i);
    assert.match(mdb, /a_search_sandbox/);
  });

  it('connectAsearchMssql rejects configured madeiradb before connect', async () => {
    let connected = false;
    await assert.rejects(
      () =>
        connectAsearchMssql({
          config: { database: 'madeiradb' },
          allowlist: ['madeiradb', 'a_search'],
          connect: async () => {
            connected = true;
            return { query: async () => [{ name: 'madeiradb' }] };
          },
        }),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    assert.equal(connected, false);
  });
});
