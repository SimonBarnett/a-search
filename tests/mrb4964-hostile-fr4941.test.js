'use strict';

/**
 * Hostile MRB #4964: parseAwinPartsCsv must emit unique MerchantProductId
 * from aw_product_id when merchant_product_id collides (FR #4941).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseAwinPartsCsv } = require('../tools/dbimport/parseAwin');

const HEADER =
  'aw_product_id,merchant_product_id,product_name,search_price,currency,aw_deep_link';

describe('MRB #4964 hostile FR #4941 parseAwinPartsCsv', () => {
  it('two rows with the same merchant sku become two Parts keys', () => {
    const csv = [
      HEADER,
      'AW-1,SKU-DUP,Widget,1.00,GBP,https://ex/1',
      'AW-2,SKU-DUP,Gadget,2.00,GBP,https://ex/2',
    ].join('\n');
    const rows = parseAwinPartsCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].MerchantProductId, 'AW-1');
    assert.equal(rows[1].MerchantProductId, 'AW-2');
    assert.equal(rows[0].MerchantSku, 'SKU-DUP');
    assert.equal(rows[1].MerchantSku, 'SKU-DUP');
  });

  it('missing aw_product_id falls back to merchant_product_id', () => {
    const csv = [HEADER, ',ONLY-SKU,Lone,3.00,GBP,https://ex/3'].join('\n');
    const rows = parseAwinPartsCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].MerchantProductId, 'ONLY-SKU');
    assert.equal(rows[0].MerchantSku, 'ONLY-SKU');
  });
});
