'use strict';

/** FR-117: orphan-safe tenant reads + Integrity docs + SELECT-only orphan report */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  normalizeUserCode,
  userCodesEqual,
  resolveTenantUser,
  readForTenantUser,
  filterRowsToKnownUsers,
  USERS_EXISTS_SQL,
} = require('../shared/mssql/orphanSafe');

const ORPHAN = '4OETP8TP'; // known Products/RejectedAsins orphan from 2026-10-08 inventory
const REAL = 'L7WDZWC8';

describe('FR-117 shared/mssql/orphanSafe', () => {
  it('normalizes codes trimmed upper-case', () => {
    assert.equal(normalizeUserCode('  ab12cd34  '), 'AB12CD34');
    assert.equal(userCodesEqual('l7wdzwc8', 'L7WDZWC8'), true);
  });

  it('resolveTenantUser fails closed when Users missing', async () => {
    /** @type {Map<string, object>} */
    const users = new Map([[REAL, { user_id: REAL }]]);
    const missing = await resolveTenantUser({
      userId: ORPHAN,
      userExists: async (code) => users.has(code),
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing_user');
    assert.equal(missing.userId, ORPHAN);

    const ok = await resolveTenantUser({
      userId: REAL.toLowerCase(),
      userExists: async (code) => users.has(code),
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.userId, REAL);
  });

  it('readForTenantUser returns no rows for orphan JWT userId (injected fake DB)', async () => {
    /** Fake DB: Products rows exist for orphan code, but Users does not. */
    const users = new Set([REAL]);
    const products = [
      { UserId: ORPHAN, ASIN: 'B00ORPHAN', Title: 'should not surface' },
      { UserId: REAL, ASIN: 'B00REAL01', Title: 'ok' },
    ];

    const orphanRows = await readForTenantUser({
      userId: ORPHAN,
      userExists: async (code) => users.has(code),
      query: async (code) => products.filter((p) => userCodesEqual(p.UserId, code)),
    });
    assert.deepEqual(orphanRows, []);

    const realRows = await readForTenantUser({
      userId: REAL,
      userExists: async (code) => users.has(code),
      query: async (code) => products.filter((p) => userCodesEqual(p.UserId, code)),
    });
    assert.equal(realRows.length, 1);
    assert.equal(realRows[0].ASIN, 'B00REAL01');
  });

  it('filterRowsToKnownUsers drops orphan-owned rows', () => {
    const rows = [
      { UserId: ORPHAN, ASIN: 'X' },
      { UserId: REAL, ASIN: 'Y' },
    ];
    const kept = filterRowsToKnownUsers(rows, 'UserId', [REAL]);
    assert.deepEqual(kept.map((r) => r.ASIN), ['Y']);
  });

  it('exports Users EXISTS SQL fragment', () => {
    assert.match(USERS_EXISTS_SQL, /dbo\.Users/i);
    assert.match(USERS_EXISTS_SQL, /CONVERT\s*\(\s*varchar\s*\(\s*8\s*\)/i);
  });
});

describe('FR-117 docs + orphan-report.sql', () => {
  it('data-model.md Integrity lists enforced FK vs logical only', () => {
    const text = fs.readFileSync(path.join(root, 'docs', 'data-model.md'), 'utf8');
    assert.match(text, /## Integrity/);
    assert.match(text, /enforced FK/i);
    assert.match(text, /logical only/i);
    assert.match(text, /UserApiKeys\.user_id/);
    assert.match(text, /Products\.UserId/);
    assert.match(text, /NOT EXISTS/);
    assert.match(text, /4OETP8TP|orphan/i);
    assert.match(text, /out of scope|DBA/i);
  });

  it('orphan-report.sql is SELECT-only (no DML/DDL)', () => {
    const sqlPath = path.join(root, 'scripts', 'orphan-report.sql');
    assert.ok(fs.existsSync(sqlPath), 'missing scripts/orphan-report.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    assert.match(sql, /SELECT/i);
    assert.match(sql, /NOT EXISTS/i);
    assert.match(sql, /dbo\.Users/i);
    assert.doesNotMatch(sql, /\bINSERT\b/i);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
    assert.doesNotMatch(sql, /\bDELETE\b/i);
    assert.doesNotMatch(sql, /\bALTER\b/i);
    assert.doesNotMatch(sql, /\bDROP\b/i);
    // MERGE is also DML
    assert.doesNotMatch(sql, /\bMERGE\b/i);
  });

  it('README links data-model.md', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /docs\/data-model\.md/);
  });
});
