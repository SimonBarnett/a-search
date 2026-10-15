'use strict';

/**
 * FR-2139 / FR-240: SQS FIFO consumer for a-search-shop-sync.fifo.
 * Visibility timeout on the queue must exceed this Lambda timeout (CDK wires 6x).
 * Credentials never come from the message body (vault via Shop only).
 */

const {
  handleShopSyncMessage,
  createPartFeedKeysStore,
  createPartsStore,
} = require('../../shared/shops/shopSync');
const { createShopsRegistry } = require('../../shared/shops/registry');

/**
 * Build injectable deps. Deploy wires real MSSQL/vault later; offline pins use
 * empty stores so parse + paid-gate paths stay testable.
 * @param {object} [overrides]
 */
function buildShopSyncDeps(overrides) {
  const o = overrides || {};
  return {
    shops: o.shops || createShopsRegistry(),
    feedKeys: o.feedKeys || createPartFeedKeysStore(),
    parts: o.parts || createPartsStore(),
    vault: o.vault || null,
    queue: o.queue || {
      deleteMessage() {},
    },
    fetchCatalog: o.fetchCatalog,
    sendEmail: o.sendEmail,
    log: o.log || (() => {}),
    refreshDays: o.refreshDays,
    now: o.now,
  };
}

/**
 * Map an SQS Lambda record to the shopSync message shape.
 * @param {object} record
 */
function recordToShopSyncMessage(record) {
  const body =
    typeof record.body === 'string' ? JSON.parse(record.body) : record.body || {};
  const attrs = record.attributes || {};
  return {
    id: String(record.messageId || record.id || ''),
    body,
    MessageGroupId: String(
      attrs.MessageGroupId || body.shopId || record.messageGroupId || '',
    ),
    receiveCount: Number(attrs.ApproximateReceiveCount || record.receiveCount || 1),
  };
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handler(event, deps) {
  const built = buildShopSyncDeps(deps);
  const results = [];
  for (const record of (event && event.Records) || []) {
    const message = recordToShopSyncMessage(record);
    // eslint-disable-next-line no-await-in-loop
    const out = await handleShopSyncMessage({
      ...built,
      message,
      queue: {
        deleteMessage() {
          // SQS event source deletes on success; backoff paths must throw/fail
          // the batch item — leave message by throwing ShopSyncRetry.
        },
        ...built.queue,
      },
    });
    if (out && out.reason === 'backoff') {
      const err = new Error('shop_sync_backoff');
      err.code = 'shop_sync_backoff';
      err.hours = out.hours;
      throw err;
    }
    results.push(out);
  }
  return { ok: true, results };
}

module.exports = {
  handler,
  buildShopSyncDeps,
  recordToShopSyncMessage,
};
