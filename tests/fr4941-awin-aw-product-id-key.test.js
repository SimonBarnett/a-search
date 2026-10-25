'use strict';

/**
 * FR #4941: Awin folder dbimport keys on aw_product_id (not merchant_product_id).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveAwinPartKey } = require('../tools/dbimport/parseAwinKey');

const ROOT = path.join(__dirname, '..');

describe('FR #4941 aw_product_id key', () => {
  it('duplicate merchant_product_id still yields unique keys from aw_product_id', () => {
    const a = resolveAwinPartKey({
      aw_product_id: 'AW-1',
      merchant_product_id: 'SKU-DUP',
    });
    const b = resolveAwinPartKey({
      aw_product_id: 'AW-2',
      merchant_product_id: 'SKU-DUP',
    });
    assert.equal(a.merchantProductId, 'AW-1');
    assert.equal(b.merchantProductId, 'AW-2');
    assert.equal(a.merchantSku, 'SKU-DUP');
    assert.equal(b.merchantSku, 'SKU-DUP');
    assert.equal(new Set([a.merchantProductId, b.merchantProductId]).size, 2);
  });

  it('prefers aw_product_id over merchant_product_id when both present', () => {
    const row = resolveAwinPartKey({
      aw_product_id: 'AWIN-9',
      merchant_product_id: 'MERCH-9',
    });
    assert.equal(row.merchantProductId, 'AWIN-9');
    assert.equal(row.merchantSku, 'MERCH-9');
  });

  it('026 migration adds MerchantSku and copies existing Awin MerchantProductId', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '026_Awin_MerchantSku.sql'),
      'utf8',
    );
    assert.equal(sql.split(/\r?\n/)[0].trim(), '-- target: a_search');
    assert.match(sql, /MerchantSku/);
    assert.match(sql, /Source\s*=\s*N'awin'/i);
  });

  it('parseAwin.js uses resolveAwinPartKey', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'tools', 'dbimport', 'parseAwin.js'),
      'utf8',
    );
    assert.match(src, /resolveAwinPartKey/);
    assert.doesNotMatch(
      src,
      /merchant_product_id \|\| lower\.aw_product_id/,
    );
  });

  it('DbImportSql.ps1 and sql.js write MerchantSku through bulk/MERGE', () => {
    const ps1 = fs.readFileSync(
      path.join(ROOT, 'tools', 'DbImportSql.ps1'),
      'utf8',
    );
    const sqlJs = fs.readFileSync(
      path.join(ROOT, 'tools', 'dbimport', 'sql.js'),
      'utf8',
    );
    assert.match(ps1, /MerchantSku/);
    assert.match(ps1, /'MerchantSku'/);
    assert.match(ps1, /MerchantSku=s\.MerchantSku/);
    assert.match(sqlJs, /columns\.add\('MerchantSku'/);
    assert.match(sqlJs, /MerchantSku=s\.MerchantSku/);
  });

  it('dbimport prefers MSSQL_DATABASE and refuses a silent default', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'tools', 'Invoke-FolderDbImport.ps1'),
      'utf8',
    );
    assert.match(src, /MSSQL_DATABASE/);
    assert.match(src, /needs_mssql_database/);
    assert.doesNotMatch(src, /\$database = if \(\$cfg\.database\) \{ \[string\]\$cfg\.database \} else \{ 'a_search' \}/);
  });
});
