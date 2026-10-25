'use strict';

/**
 * FR #4941: Awin Parts key is aw_product_id (plus Source at import), not merchant_product_id.
 * @param {Record<string, string>} lower
 * @returns {{ merchantProductId: string, merchantSku: string }}
 */
function resolveAwinPartKey(lower) {
  const row = lower && typeof lower === 'object' ? lower : {};
  const merchantSku = String(row.merchant_product_id || '').trim();
  const merchantProductId = String(
    row.aw_product_id || merchantSku || row.product_id || '',
  ).trim();
  return {
    merchantProductId: merchantProductId.slice(0, 256),
    merchantSku: merchantSku.slice(0, 256),
  };
}

module.exports = { resolveAwinPartKey };
