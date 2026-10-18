'use strict';

/**
 * FR-251 / #1365: a_search owns writes; madeiradb is read-only for a-search.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const SCAN_ROOTS = [
  'entry',
  'worker',
  'maintainer',
  'providers',
  'shared',
  'scripts',
  'db',
  'cdk',
];
const WRITE_RE =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|BULK\s+INSERT|CREATE|ALTER|DROP|sp_rename|GRANT|DENY|REVOKE)\b/i;
const MADEIRA_TARGET_RE = /\bmadeiradb\s*\.|\bUSE\s+madeiradb\b|-d\s+madeiradb\b/i;
const ALLOWLIST_FILES = new Set([
  path.normalize('scripts/orphan-report.sql'),
  path.normalize('scripts/partner-removal-impact.sql'),
]);

const {
  assertAsearchDatabase,
  connectAsearchMssql,
  MssqlConnectError,
  DEFAULT_ALLOWLIST,
} = require('../shared/mssql/connect');
const {
  runMigrations,
  assertTargetHeader,
  listMigrationFiles,
} = require('../scripts/db-migrate');

const STACK_PATH = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else if (/\.(js|ts|sql|md)$/i.test(ent.name)) out.push(full);
  }
  return out;
}

describe('FR-251 madeiradb read-only + a_search ownership', () => {
  it('CDK defaults live=a_search sandbox=a_search_sandbox; rejects madeiradb wire', () => {
    // Source pins (no aws-cdk-lib required — MRB #2209 / FR #3717 seat gap).
    const stackSrc = fs.readFileSync(STACK_PATH, 'utf8');
    assert.match(stackSrc, /MSSQL_LIVE_DATABASE = 'a_search'/);
    assert.match(stackSrc, /MSSQL_SANDBOX_DATABASE_DEFAULT = 'a_search_sandbox'/);
    assert.doesNotMatch(stackSrc, /MSSQL_LIVE_DATABASE = 'madeiradb'/);
    assert.match(stackSrc, /mssqlAppSecretArn/);
    assert.match(stackSrc, /MADEIRADB_DATABASE/);
    assert.match(
      stackSrc,
      /MSSQL_DATABASE=madeiradb forbidden \(FR-251\)/,
    );
    let wireMssqlSecretEnv;
    try {
      ({ wireMssqlSecretEnv } = require('../cdk/lib/a-search-stack'));
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND') return;
      throw err;
    }
    assert.throws(
      () =>
        wireMssqlSecretEnv(
          {
            addEnvironment() {},
          },
          {
            secretValueFromJson: () => ({ unsafeUnwrap: () => 'x' }),
            grantRead() {},
          },
          { database: 'madeiradb' },
        ),
      /madeiradb forbidden|FR-251/,
    );
  });

  it('connector throws wrong_database for madeiradb; allowlist ok', async () => {
    assert.deepEqual(DEFAULT_ALLOWLIST, ['a_search', 'a_search_sandbox']);
    assert.throws(
      () => assertAsearchDatabase('madeiradb'),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    // MRB #2209: allowlist must not re-enable madeiradb.
    assert.throws(
      () =>
        assertAsearchDatabase('madeiradb', { allowlist: ['madeiradb', 'a_search'] }),
      (err) =>
        err instanceof MssqlConnectError &&
        err.code === 'wrong_database' &&
        /forbidden|FR-251/i.test(err.message),
    );
    assert.equal(assertAsearchDatabase('a_search'), 'a_search');
    await assert.rejects(
      () =>
        connectAsearchMssql({
          config: { database: 'madeiradb' },
          connect: async () => ({ query: async () => [{ name: 'madeiradb' }] }),
        }),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    const pool = await connectAsearchMssql({
      config: { database: 'a_search' },
      connect: async () => ({
        query: async () => ({ recordset: [{ name: 'a_search' }] }),
      }),
    });
    assert.ok(pool);
  });

  it('db-migrate refuses madeiradb; requires -- target: a_search header', async () => {
    await assert.rejects(
      () =>
        runMigrations({
          database: 'madeiradb',
          query: async () => ({}),
        }),
      (err) => err instanceof MssqlConnectError && err.code === 'wrong_database',
    );
    assert.throws(
      () => assertTargetHeader('CREATE TABLE x (id int);', 'bad.sql'),
      /target: a_search/,
    );
    const files = listMigrationFiles();
    assert.ok(files.some((f) => /000_SchemaMigrations\.sql$/i.test(f)));
    assert.ok(files.some((f) => /014_mdb_identity_views\.sql$/i.test(f)));
    assert.ok(files.some((f) => /003_PartFeedKeys\.sql$/i.test(f)));
    for (const f of files) {
      const sql = fs.readFileSync(f, 'utf8');
      assertTargetHeader(sql, path.basename(f));
      assert.doesNotMatch(sql, /CREATE\s+TRIGGER[\s\S]{0,80}INSTEAD\s+OF/i);
    }
  });

  it('mdb migration: live views / sandbox tables; no INSTEAD OF', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '014_mdb_identity_views.sql'),
      'utf8',
    );
    assert.match(sql, /CREATE VIEW mdb\.Users/i);
    assert.match(sql, /a_search_sandbox/);
    assert.match(sql, /CREATE TABLE mdb\.Users/i);
    assert.doesNotMatch(sql, /CREATE\s+TRIGGER[\s\S]{0,80}INSTEAD\s+OF/i);
  });

  it('repo scan: no write/DDL targeting madeiradb outside allowlisted SELECT reports', () => {
    /** @type {string[]} */
    const offenders = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walkFiles(path.join(ROOT, root))) {
        const rel = path.relative(ROOT, file);
        if (rel.startsWith(`tests${path.sep}`)) continue;
        if (ALLOWLIST_FILES.has(path.normalize(rel))) {
          const text = fs.readFileSync(file, 'utf8');
          assert.ok(
            !WRITE_RE.test(text) || !MADEIRA_TARGET_RE.test(text),
            `allowlist file still looks like write+madeiradb: ${rel}`,
          );
          // Allowlisted reports may mention madeiradb for SELECT; must not write.
          if (WRITE_RE.test(text) && /\bmadeiradb\b/i.test(text)) {
            // Soft: only fail if write keyword appears in same line as madeiradb
            for (const line of text.split(/\r?\n/)) {
              if (WRITE_RE.test(line) && /\bmadeiradb\b/i.test(line)) {
                offenders.push(`${rel}: ${line.trim()}`);
              }
            }
          }
          continue;
        }
        // FR-251 docs and migration comments may mention madeiradb as forbidden.
        if (
          /docs[\\/]fr[\\/]FR-251/i.test(rel) ||
          /014_mdb_identity_views\.sql$/i.test(rel) ||
          /fr251-madeiradb-readonly\.test\.js$/i.test(rel)
        ) {
          continue;
        }
        const text = fs.readFileSync(file, 'utf8');
        // Skip pure documentation of the forbid rule in SKILL/README comments.
        if (/\.(md)$/i.test(rel)) {
          // Fail docs that still instruct sqlcmd -d madeiradb for DDL apply.
          if (/-d\s+madeiradb/i.test(text) && /sqlcmd|CREATE TABLE|ALTER TABLE/i.test(text)) {
            // allow if the line is crossed out / forbidden wording
            for (const line of text.split(/\r?\n/)) {
              if (
                /-d\s+madeiradb/i.test(line) &&
                !/never|forbidden|must not|do not|CAST IRON|read-only/i.test(line)
              ) {
                offenders.push(`${rel}: ${line.trim()}`);
              }
            }
          }
          continue;
        }
        for (const line of text.split(/\r?\n/)) {
          if (!WRITE_RE.test(line)) continue;
          if (!MADEIRA_TARGET_RE.test(line) && !/\bmdb\s*\./i.test(line)) continue;
          // Allow SELECT-only mentions of mdb.
          if (/^\s*(--|\/\/|\*|\/\*)/.test(line)) continue;
          if (/\bSELECT\b/i.test(line) && !/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP)\b/i.test(line)) {
            continue;
          }
          // CREATE VIEW mdb.* in migrations is the approved live path.
          if (
            /014_mdb_identity_views\.sql$/i.test(rel) &&
            /CREATE\s+VIEW\s+mdb\./i.test(line)
          ) {
            continue;
          }
          if (
            /014_mdb_identity_views\.sql$/i.test(rel) &&
            /CREATE\s+(TABLE|SCHEMA)\s+mdb\./i.test(line)
          ) {
            continue;
          }
          offenders.push(`${rel}: ${line.trim().slice(0, 160)}`);
        }
      }
    }
    assert.deepEqual(offenders, [], offenders.join('\n'));
  });

  it('docs/fr/FR-251.md Decision LOCKED; environments prefer a_search', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-251.md'), 'utf8');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /a_search_sandbox/);
    assert.match(fr, /never writes madeiradb/i);
    const env = fs.readFileSync(path.join(ROOT, 'docs', 'environments.md'), 'utf8');
    assert.match(env, /a_search/);
    assert.match(env, /FR-251/);
  });

  it('fixture: scanner detects INSERT into madeiradb', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr251-'));
    const bad = path.join(tmp, 'bad.js');
    fs.writeFileSync(
      bad,
      "await db.query('INSERT INTO madeiradb.dbo.Users (user_id) VALUES (@id)');\n",
    );
    const text = fs.readFileSync(bad, 'utf8');
    assert.ok(WRITE_RE.test(text) && MADEIRA_TARGET_RE.test(text));
  });
});
