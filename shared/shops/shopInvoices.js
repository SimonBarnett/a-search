'use strict';

/**
 * FR-239 / FR-241: ShopInvoices mirror for unpaid-period counter.
 * Target: a_search only (FR-251). Never madeiradb.
 */

function createShopInvoicesStore() {
  /** @type {Map<string, object>} */
  const byInvoiceId = new Map();

  /**
   * @param {{
   *   shopId: string,
   *   invoiceId: string,
   *   periodStart?: string|null,
   *   periodEnd?: string|null,
   *   status: string,
   *   subscriptionId?: string|null,
   *   nowMs?: number,
   * }} row
   */
  function upsert(row) {
    const invoiceId = String(row.invoiceId || '');
    if (!invoiceId) {
      const err = new Error('invoice_id_required');
      err.code = 'invoice_id_required';
      throw err;
    }
    const prev = byInvoiceId.get(invoiceId) || {};
    const next = {
      shopId: String(row.shopId || prev.shopId || ''),
      invoiceId,
      periodStart:
        row.periodStart !== undefined
          ? row.periodStart
          : prev.periodStart != null
            ? prev.periodStart
            : null,
      periodEnd:
        row.periodEnd !== undefined
          ? row.periodEnd
          : prev.periodEnd != null
            ? prev.periodEnd
            : null,
      status: String(row.status || prev.status || ''),
      subscriptionId:
        row.subscriptionId !== undefined
          ? row.subscriptionId
          : prev.subscriptionId != null
            ? prev.subscriptionId
            : null,
      updatedAt: new Date(
        row.nowMs != null ? Number(row.nowMs) : Date.now(),
      ).toISOString(),
    };
    byInvoiceId.set(invoiceId, next);
    return { ...next };
  }

  function get(invoiceId) {
    const row = byInvoiceId.get(String(invoiceId || ''));
    return row ? { ...row } : null;
  }

  function listByShop(shopId) {
    const id = String(shopId || '');
    return [...byInvoiceId.values()]
      .filter((r) => r.shopId === id)
      .map((r) => ({ ...r }));
  }

  return { upsert, get, listByShop };
}

module.exports = {
  createShopInvoicesStore,
};
