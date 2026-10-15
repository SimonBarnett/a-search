'use strict';

/**
 * MRB #2206 hostile pins for FR-250 / #1364.
 * isPartnerSql must fetch permissions for JS parse (not IS NOT NULL as partnerhood);
 * FromDb uses the exported constant; role/Partner ignored; no write SQL.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  isPartnerSql,
  isPartner,
  isPartnerFromDb,
  permissionsContainPartner,
} = require('../shared/identity/isPartner');

describe('MRB #2206 hostile FR-250 isPartner', () => {
  it('isPartnerSql selects permissions; never IS NOT NULL as partner predicate', () => {
    assert.match(isPartnerSql, /^SELECT permissions FROM mdb\.Users WHERE user_id = @code$/);
    assert.doesNotMatch(isPartnerSql, /IS NOT NULL/i);
    assert.doesNotMatch(isPartnerSql, /SELECT 1/i);
    assert.doesNotMatch(isPartnerSql, /UPDATE|INSERT|DELETE|MERGE/i);
  });

  it('isPartnerFromDb uses isPartnerSql constant; non-null permissions alone is not partner', async () => {
    /** @type {string[]} */
    const sqls = [];
    const db = {
      async query(sql) {
        sqls.push(sql);
        return { recordset: [{ permissions: '["community","admin"]' }] };
      },
    };
    assert.equal(await isPartnerFromDb(db, 'L7WDZWC8'), false);
    assert.equal(sqls[0], isPartnerSql);
    assert.equal(permissionsContainPartner('["community"]'), false);
    assert.equal(
      isPartner({ role: 'partner', permissions: '["community"]' }),
      false,
    );
  });

  it('identity DECIDED permissions exact token; no sync-partner-from-role script', () => {
    const text = fs.readFileSync(path.join(ROOT, 'docs', 'identity.md'), 'utf8');
    assert.match(text, /DECIDED 2026-10-10/);
    assert.match(text, /exact token/);
    assert.match(text, /never writes/i);
    assert.equal(
      fs.existsSync(path.join(ROOT, 'scripts', 'sync-partner-from-role.js')),
      false,
    );
  });
});
