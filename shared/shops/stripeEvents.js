'use strict';

/**
 * FR-239: idempotent Stripe event log (30-day retention for production;
 * in-memory store for unit pins).
 */

function createStripeEventStore() {
  /** @type {Map<string, { id: string, type: string, seenAt: string }>} */
  const byId = new Map();
  return {
    /**
     * @param {string} eventId
     * @returns {boolean} true if already seen
     */
    has(eventId) {
      return byId.has(String(eventId || ''));
    },
    /**
     * @param {{ id: string, type?: string, nowMs?: number }} args
     * @returns {boolean} true if newly recorded
     */
    record(args) {
      const id = String((args && args.id) || '');
      if (!id) return false;
      if (byId.has(id)) return false;
      byId.set(id, {
        id,
        type: String((args && args.type) || ''),
        seenAt: new Date(
          args && args.nowMs != null ? Number(args.nowMs) : Date.now(),
        ).toISOString(),
      });
      return true;
    },
    clear() {
      byId.clear();
    },
    size() {
      return byId.size;
    },
  };
}

module.exports = {
  createStripeEventStore,
};
