'use strict';

/**
 * docs/mrb-5284: hostile pins for FR #5282 FTS columns and E-flite gates.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const qp = require('../providers/local/sql/src/queryParts');

describe('docs/mrb-5284 FR #5282 FTS hostile', () => {
  it('exported FT column lists include Brand, Mpn, MerchantSku', () => {
    assert.match(qp.FT_PARTS_CONTAINS_COLS, /p\.Brand/);
    assert.match(qp.FT_PARTS_CONTAINS_COLS, /p\.Mpn/);
    assert.match(qp.FT_PARTS_CONTAINS_COLS, /p\.MerchantSku/);
    assert.match(qp.FT_PARTS_FREETEXT_COLS, /Brand/);
    assert.match(qp.FT_PARTS_FREETEXT_COLS, /Mpn/);
    assert.match(qp.FT_PARTS_FREETEXT_COLS, /MerchantSku/);
  });

  it('E-flite brand gate still emitted; hobbyzone* still suppressed with SKU', () => {
    const gates = qp.extractBrandModelGateTokens({
      queries: [{ q: 'E-flite UMX Waco EFLU53550Y' }],
    });
    assert.ok(gates.some((g) => /^"e-flite\*"$/i.test(g)), String(gates));
    const hz = qp.extractBrandModelGateTokens({
      queries: [{ q: 'HobbyZone Sport Cub HBZ444000' }],
    });
    assert.equal(hz.some((g) => /^"hobbyzone\*"$/i.test(g)), false, String(hz));
  });

  it('migration 027 remains in tree', () => {
    const sql = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '027_Parts_FullText_Mpn_MerchantSku.sql'),
      'utf8',
    );
    assert.match(sql, /MerchantSku/);
    assert.match(sql, /ALTER FULLTEXT INDEX/i);
  });
});
