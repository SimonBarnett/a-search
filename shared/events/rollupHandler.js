'use strict';

/**
 * FR-234: hourly rollup Lambda - writes stats.json for widgets with new counters.
 * Does not enqueue agent jobs.
 */

const {
  writeWidgetStatsJson,
  writeHostStatsJson,
} = require('./rollupStatsJson');
const {
  getDefaultWidgetStatsStore,
} = require('./memoryWidgetStatsStore');

/**
 * @param {object} event
 * @param {object} [_context]
 * @param {object} [deps]
 */
async function handler(event, _context, deps = {}) {
  const statsStore = deps.statsStore || getDefaultWidgetStatsStore();
  const root = deps.root || process.env.A_SEARCH_WIDGET_ROOT || '';
  const env = deps.env === 'live' || process.env.A_SEARCH_ENV === 'live' ? 'live' : 'sandbox';
  const targets = Array.isArray(event && event.widgets) ? event.widgets : [];
  const agentQueue = deps.agentQueue || { messages: [] };
  const written = [];
  const byHost = new Map();
  for (const t of targets) {
    const r = writeWidgetStatsJson({
      statsStore,
      root,
      env,
      customerNumber: t.customerNumber,
      widgetGuid: t.widgetGuid,
      generatedAt: deps.generatedAt,
      agentQueue,
    });
    written.push(r.file);
    const cn = String(t.customerNumber);
    if (!byHost.has(cn)) byHost.set(cn, []);
    byHost.get(cn).push(t.widgetGuid);
  }
  for (const [cn, guids] of byHost.entries()) {
    writeHostStatsJson({
      statsStore,
      root,
      env,
      customerNumber: cn,
      widgetGuids: guids,
      generatedAt: deps.generatedAt,
    });
  }
  return { ok: true, written: written.length, agentQueueLen: agentQueue.messages.length };
}

module.exports = { handler };
