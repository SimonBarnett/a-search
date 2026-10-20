'use strict';

/**
 * FR #4519: 014_mdb_identity_views must use sp_executesql (not EXEC(expr+QUOTENAME)),
 * map madeiradb.dbo.Users.email_address AS email, and skip dead MachineName init.
 * Views stay SELECT-only on madeiradb (FR-251).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MDB_SQL = path.join(
  ROOT,
  'db',
  'migrations',
  '014_mdb_identity_views.sql',
);

/** Expected madeiradb.dbo.Users columns exposed via mdb.Users (live view). */
const MADEIRADB_USERS_COLUMNS = [
  ['user_id', 'user_id'],
  ['role', 'role'],
  ['permissions', 'permissions'],
  ['referrer', 'referrer'],
  ['email_address', 'email'], // live column -> view alias
];

describe('FR #4519 mdb identity views SQL', () => {
  it('does not pass QUOTENAME concat into EXEC(); uses sp_executesql + @sql', () => {
    const sql = fs.readFileSync(MDB_SQL, 'utf8');
    assert.doesNotMatch(
      sql,
      /EXEC\s*\(\s*N'[^']*'\s*\+\s*QUOTENAME\s*\(/i,
      'EXEC(N\'...\' + QUOTENAME(...)) is invalid T-SQL',
    );
    assert.match(sql, /DECLARE\s+@sql\s+nvarchar\s*\(\s*max\s*\)/i);
    assert.match(sql, /(?:EXEC|EXECUTE)\s+(?:sys\.)?sp_executesql\s+@sql/i);
  });

  it('mdb.Users selects email_address AS email (madeiradb column names)', () => {
    const sql = fs.readFileSync(MDB_SQL, 'utf8');
    assert.match(
      sql,
      /CREATE\s+VIEW\s+mdb\.Users[\s\S]{0,200}email_address\s+AS\s+email/i,
    );
    // Old bug: SELECT ... email FROM madeiradb (column is email_address).
    assert.doesNotMatch(
      sql,
      /referrer\s*,\s*email\s+FROM/i,
    );
    for (const [src, alias] of MADEIRADB_USERS_COLUMNS) {
      if (src === alias) {
        assert.match(
          sql,
          new RegExp(`\\b${src}\\b`, 'i'),
          `missing madeiradb column ${src}`,
        );
      } else {
        assert.match(
          sql,
          new RegExp(`${src}\\s+AS\\s+${alias}`, 'i'),
          `missing ${src} AS ${alias}`,
        );
      }
    }
  });

  it('does not set @madeira from SERVERPROPERTY MachineName (dead code)', () => {
    const sql = fs.readFileSync(MDB_SQL, 'utf8');
    assert.doesNotMatch(sql, /SERVERPROPERTY\s*\(\s*'MachineName'\s*\)/i);
    assert.match(sql, /SESSION_CONTEXT\s*\(\s*N'MADEIRADB_DATABASE'\s*\)/i);
    assert.match(sql, /SET\s+@madeira\s*=\s*N'madeiradb'/i);
  });

  it('live path is SELECT-only three-part madeiradb; no DML/DDL on madeiradb', () => {
    const sql = fs.readFileSync(MDB_SQL, 'utf8');
    assert.match(sql, /CREATE\s+VIEW\s+mdb\.(Users|Partner|clubscan|UserApiKeys)/i);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b[\s\S]{0,40}madeiradb/i);
    assert.doesNotMatch(
      sql,
      /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|PROCEDURE)\b[\s\S]{0,40}madeiradb/i,
    );
  });
});
