'use strict';

/**
 * FR-250 / #1364: partner = permissions contains exact token 'partner' (read-only).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DOC = path.join(ROOT, 'docs', 'identity.md');

const {
  isPartnerSql,
  parsePermissions,
  permissionsContainPartner,
  isPartner,
  isPartnerFromDb,
} = require('../shared/identity/isPartner');
const { UserIdError } = require('../shared/identity/userId');

describe('FR-250 isPartner permissions rule', () => {
  it('docs/identity.md DECIDED 2026-10-10; no open-question partner gate', () => {
    const buf = fs.readFileSync(DOC);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text));
    assert.match(text, /DECIDED 2026-10-10/);
    assert.match(text, /permissions/);
    assert.match(text, /exact token/);
    assert.match(text, /shared\/identity\/isPartner\.js/);
    assert.match(text, /mdb\.Users/);
    assert.match(text, /never writes/i);
    assert.doesNotMatch(text, /Open question \(needs Simon\)/);
    assert.doesNotMatch(text, /must not treat any single one as authoritative/);
  });

  it('parsePermissions accepts JSON and single-quoted arrays', () => {
    assert.deepEqual(parsePermissions('["partner","admin"]'), [
      'partner',
      'admin',
    ]);
    assert.deepEqual(parsePermissions("['partner','community']"), [
      'partner',
      'community',
    ]);
    assert.deepEqual(parsePermissions(''), []);
    assert.deepEqual(parsePermissions(null), []);
    assert.deepEqual(parsePermissions('not-json'), []);
  });

  it('exact token partner; no partnership substring false positive', () => {
    assert.equal(permissionsContainPartner('["partner"]'), true);
    assert.equal(permissionsContainPartner("['Partner']"), true);
    assert.equal(permissionsContainPartner('["admin"]'), false);
    assert.equal(permissionsContainPartner('["partnership"]'), false);
    assert.equal(permissionsContainPartner('["co-partner"]'), false);
    assert.equal(permissionsContainPartner('%partner%'), false);
  });

  it('isPartner(user) reads permissions only; ignores role and Partner', () => {
    assert.equal(isPartner({ permissions: '["partner"]' }), true);
    assert.equal(isPartner({ Permissions: "['partner']" }), true);
    assert.equal(
      isPartner({ role: 'partner', permissions: '["community"]' }),
      false,
    );
    assert.equal(
      isPartner({ role: null, permissions: '["partner","admin"]' }),
      true,
    );
    assert.equal(isPartner(null), false);
    assert.equal(isPartner({}), false);
  });

  it('isPartnerSql targets mdb.Users; isPartnerFromDb caches and is read-only', async () => {
    assert.match(isPartnerSql, /mdb\.Users/);
    assert.match(isPartnerSql, /@code/);
    assert.match(isPartnerSql, /SELECT\s+permissions/i);
    assert.doesNotMatch(isPartnerSql, /permissions\s+IS\s+NOT\s+NULL/i);
    assert.doesNotMatch(isPartnerSql, /UPDATE|INSERT|DELETE/i);

    /** @type {string[]} */
    const calls = [];
    const db = {
      async query(sql, params) {
        calls.push(sql);
        assert.match(sql, /mdb\.Users/);
        assert.doesNotMatch(sql, /UPDATE|INSERT|DELETE/i);
        assert.equal(params.code, 'L7WDZWC8');
        return {
          recordset: [{ permissions: '["partner"]' }],
        };
      },
    };
    const cache = new Map();
    assert.equal(await isPartnerFromDb(db, 'L7WDZWC8', { cache }), true);
    assert.equal(await isPartnerFromDb(db, 'L7WDZWC8', { cache }), true);
    assert.equal(calls.length, 1, 'second call must hit cache');

    await assert.rejects(
      () => isPartnerFromDb(db, 'bad'),
      (err) => err instanceof UserIdError,
    );
  });

  it('no sync-partner-from-role script (cleanup cancelled FR-251)', () => {
    const p = path.join(ROOT, 'scripts', 'sync-partner-from-role.js');
    assert.equal(fs.existsSync(p), false);
  });
});
