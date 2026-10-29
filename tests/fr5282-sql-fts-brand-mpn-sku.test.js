'use strict';

/**
 * FR #5282: SQL full-text includes Brand, Mpn, MerchantSku; hyphenated
 * brands like E-flite become gates; #5257 hobbyzone* noise guard stays.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const qp = require('../providers/local/sql/src/queryParts');

const ROOT = path.join(__dirname, '..');

describe('FR #5282 SQL FTS Brand/Mpn/MerchantSku + E-flite gates', () => {
  it('isBrandLikeToken keeps hyphenated E-flite and rejects UMX', () => {
    assert.equal(qp.isBrandLikeToken('E-flite'), true);
    assert.equal(qp.isBrandLikeToken('e-flite'), true);
    assert.equal(qp.isBrandLikeToken('UMX'), false);
  });

  it('extractBrandModelGateTokens treats E-flite as a brand gate', () => {
    const gates = qp.extractBrandModelGateTokens({
      queries: [
        {
          q: 'E-flite UMX Waco Yellow BNF Basic EFLU53550Y AS3X SAFE park flying',
        },
      ],
    });
    assert.ok(gates.some((g) => /^"e-flite\*"$/i.test(g)), String(gates));
    assert.ok(gates.some((g) => /EFLU53550Y/i.test(g)), String(gates));
    assert.equal(gates.some((g) => /hobbyzone\*/i.test(g)), false);
  });

  it('HBZ444000 and EFLU53550Y are model-number gates', () => {
    assert.equal(qp.isModelNumberToken('HBZ444000'), true);
    assert.equal(qp.isModelNumberToken('EFLU53550Y'), true);
    const gates = qp.extractBrandModelGateTokens({
      queries: [{ q: 'HobbyZone Sport Cub S 2 615mm RTF SAFE telemetry HBZ444000' }],
    });
    assert.ok(gates.some((g) => /HBZ444000/i.test(g)), String(gates));
    assert.equal(
      gates.some((g) => /^"hobbyzone\*"$/i.test(g)),
      false,
      `FR #5257 keep dropping hobbyzone* when a SKU/phrase exists: ${gates}`,
    );
  });

  it('buildSelectSql CONTAINS and FREETEXTTABLE include Brand, Mpn, MerchantSku', () => {
    const sql = qp.buildSelectSql(1, 1);
    assert.match(
      sql,
      /CONTAINS\(\(p\.Title,\s*p\.Description,\s*p\.Brand,\s*p\.Mpn,\s*p\.MerchantSku\),\s*@gate0\)/,
    );
    assert.match(
      sql,
      /NOT CONTAINS\(\(p\.Title,\s*p\.Description,\s*p\.Brand,\s*p\.Mpn,\s*p\.MerchantSku\),\s*@ex0\)/,
    );
    assert.match(
      sql,
      /FREETEXTTABLE\s*\(\s*dbo\.Parts\s*,\s*\(\s*Title\s*,\s*Description\s*,\s*Brand\s*,\s*Mpn\s*,\s*MerchantSku\s*\)\s*,\s*@q\s*\)/i,
    );
    assert.doesNotMatch(sql, /SELECT\s+TOP/i);
    assert.doesNotMatch(sql, /FREETEXTTABLE\s*\([^)]+,\s*@top\s*\)/i);
  });

  it('admitRowsByExactGates matches SKU on Mpn or MerchantSku', () => {
    const rows = [
      {
        Title: 'Unrelated title',
        Description: '',
        Brand: '',
        Mpn: 'HBZ444000',
        MerchantSku: '',
      },
      {
        Title: 'Another',
        Description: '',
        Brand: 'E-flite',
        Mpn: '',
        MerchantSku: 'EFLU53550Y',
      },
      { Title: 'No sku', Description: 'park flying', Brand: '', Mpn: '', MerchantSku: '' },
    ];
    const skuGates = ['"HBZ444000"', '"EFLU53550Y"'];
    const admitted = qp.admitRowsByExactGates(rows, skuGates);
    assert.equal(admitted.length, 2);
    assert.ok(admitted.some((r) => r.Mpn === 'HBZ444000'));
    assert.ok(admitted.some((r) => r.MerchantSku === 'EFLU53550Y'));
  });

  it('admitRowsByExactGates matches E-flite brand prefix on Brand column', () => {
    const rows = [
      { Title: 'UMX Waco', Description: '', Brand: 'E-flite', Mpn: '', MerchantSku: '' },
      { Title: 'Paint stand', Description: 'hobby furniture', Brand: 'Hobbyzone', Mpn: '', MerchantSku: '' },
    ];
    const admitted = qp.admitRowsByExactGates(rows, ['"e-flite*"']);
    assert.equal(admitted.length, 1);
    assert.equal(admitted[0].Brand, 'E-flite');
  });

  it('migration 027 adds Mpn and MerchantSku to the Parts full-text index', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '027_Parts_FullText_Mpn_MerchantSku.sql'),
      'utf8',
    );
    assert.match(sql, /-- target:\s*a_search/);
    assert.match(sql, /FR #5282/);
    assert.match(sql, /ALTER FULLTEXT INDEX ON dbo\.Parts ADD \(Mpn/i);
    assert.match(sql, /MerchantSku/);
    assert.match(sql, /Brand/);
  });

  it('docs pin FR #5282 Brand/Mpn/MerchantSku and E-flite', () => {
    const text = fs.readFileSync(
      path.join(ROOT, 'docs', 'walrus-sql-drain.md'),
      'utf8',
    );
    assert.match(text, /FR #5282/);
    assert.match(text, /MerchantSku/);
    assert.match(text, /E-flite/);
    assert.match(text, /5257/);
  });
});
