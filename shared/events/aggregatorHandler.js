'use strict';

/**
 * FR-234: SQS batch aggregator Lambda entry (applies accepted events to stats store).
 */

const { applyOneEvent } = require('./ingestBatch');
const {
  getDefaultWidgetStatsStore,
} = require('./memoryWidgetStatsStore');

/**
 * @param {object} event SQS event
 * @param {object} [_context]
 * @param {object} [deps]
 */
async function handler(event, _context, deps = {}) {
  const statsStore = deps.statsStore || getDefaultWidgetStatsStore();
  const nowMs = deps.nowMs != null ? Number(deps.nowMs) : Date.now();
  const records = (event && event.Records) || [];
  let applied = 0;
  for (const rec of records) {
    let body;
    try {
      body = JSON.parse(rec.body || '{}');
    } catch {
      continue;
    }
    const events = Array.isArray(body.events) ? body.events : [];
    for (const ev of events) {
      if (applyOneEvent(statsStore, ev, nowMs)) applied += 1;
    }
  }
  return { ok: true, applied };
}

module.exports = { handler };
