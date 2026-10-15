'use strict';

/**
 * FR-2139 / FR-240: SQS FIFO consumer for a-search-shop-sync.fifo.
 * Visibility timeout on the queue must exceed this Lambda timeout (CDK wires 6x).
 * Credentials never come from the message body (vault via Shop only).
 *
 * MRB #2227: AWS invokes handler(event, context). Never treat Lambda context as
 * injectable deps (would look "configured" incorrectly). Without real deps,
 * fail closed (throw) so SQS retries / DLQ — do not ack/delete as shop_not_found
 * on the default empty in-memory registry.
 */

const {
  handleShopSyncMessage,
  createPartFeedKeysStore,
  createPartsStore,
} = require('../../shared/shops/shopSync');
const { createShopsRegistry } = require('../../shared/shops/registry');

/**
 * Build injectable deps. Deploy wires real MSSQL/vault later; offline pins pass
 * explicit overrides. Production Lambda with no overrides must not consume.
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
 * True when the object looks like shop-sync test/deploy deps (not AWS context).
 * @param {object} o
 */
function isShopSyncDeps(o) {
  if (!o || typeof o !== 'object') return false;
  if (o.awsRequestId || o.invokedFunctionArn || o.getRemainingTimeInMillis) {
    return false;
  }
  return !!(
    o.shops ||
    o.feedKeys ||
    o.parts ||
    o.vault ||
    o.fetchCatalog ||
    o.queue ||
    o.sendEmail ||
    o.refreshDays ||
    o.now
  );
}

/**
 * Resolve injectable deps from handler(event, context, deps) or legacy
 * handler(event, deps) test calls.
 * @param {object} [contextOrDeps]
 * @param {object} [maybeDeps]
 * @returns {object|undefined}
 */
function resolveShopSyncDeps(contextOrDeps, maybeDeps) {
  if (isShopSyncDeps(maybeDeps)) return maybeDeps;
  if (isShopSyncDeps(contextOrDeps)) return contextOrDeps;
  return undefined;
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
 * @param {object} [contextOrDeps] AWS context, or deps when tests use 2-arg form
 * @param {object} [maybeDeps] injectable deps (3-arg form, matches schedule.js)
 */
async function handler(event, contextOrDeps, maybeDeps) {
  const overrides = resolveShopSyncDeps(contextOrDeps, maybeDeps);
  // MRB #2227: unconfigured consumer must not ack/delete the FIFO.
  if (!overrides) {
    const err = new Error('shop_sync_deps_unconfigured');
    err.code = 'shop_sync_deps_unconfigured';
    throw err;
  }
  const built = buildShopSyncDeps(overrides);
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
  resolveShopSyncDeps,
  isShopSyncDeps,
};
