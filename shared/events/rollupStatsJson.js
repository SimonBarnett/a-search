'use strict';

/**
 * FR-234: hourly rollup writes widget + host stats.json (does not enqueue agent jobs).
 */

const fs = require('node:fs');
const path = require('node:path');
const { widgetDir, hostDir } = require('../widgets/widgetPath');

/**
 * @param {number} clicks
 * @param {number} denom
 * @returns {number}
 */
function ctr(clicks, denom) {
  const d = Number(denom) || 0;
  const c = Number(clicks) || 0;
  if (d <= 0) return 0;
  return Math.round((c / d) * 10000) / 10000;
}

/**
 * @param {object[]} rows
 * @param {string} fromDay
 * @param {string} toDay
 */
function sumWindow(rows, fromDay, toDay) {
  let views = 0;
  let partImpressions = 0;
  let clicks = 0;
  for (const r of rows) {
    if (r.day < fromDay || r.day > toDay) continue;
    if (r.partNumber === '') {
      views += Number(r.views) || 0;
      clicks += Number(r.clicks) || 0;
    } else {
      partImpressions += Number(r.partImpressions) || 0;
    }
  }
  return {
    views,
    partImpressions,
    clicks,
    ctr: ctr(clicks, views),
  };
}

/**
 * @param {{
 *   statsStore: object,
 *   root: string,
 *   env: string,
 *   customerNumber: string,
 *   widgetGuid: string,
 *   generatedAt?: string,
 *   agentQueue?: { enqueue?: Function, messages?: object[] },
 * }} args
 */
function writeWidgetStatsJson(args) {
  const generatedAt = args.generatedAt || new Date().toISOString();
  const to = new Date(generatedAt);
  const dayTo = to.toISOString().slice(0, 10);
  const d7 = new Date(to.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const d30 = new Date(to.getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const rows = args.statsStore.listDaily({
    env: args.env,
    widgetGuid: args.widgetGuid,
    fromDay: d30,
    toDay: dayTo,
  });
  const partsMap = new Map();
  for (const r of rows) {
    if (!r.partNumber) continue;
    const p = partsMap.get(r.partNumber) || {
      partNumber: r.partNumber,
      partId: r.partNumber,
      impressions7d: 0,
      clicks7d: 0,
      impressions30d: 0,
      clicks30d: 0,
      lastClickAt: null,
    };
    const in7 = r.day >= d7;
    p.impressions30d += Number(r.partImpressions) || 0;
    p.clicks30d += Number(r.clicks) || 0;
    if (in7) {
      p.impressions7d += Number(r.partImpressions) || 0;
      p.clicks7d += Number(r.clicks) || 0;
    }
    if ((Number(r.clicks) || 0) > 0) {
      p.lastClickAt = r.day + 'T00:00:00.000Z';
    }
    partsMap.set(r.partNumber, p);
  }
  const parts = [...partsMap.values()].map((p) => ({
    ...p,
    ctr30d: ctr(p.clicks30d, p.impressions30d),
  }));
  const payload = {
    widgetGuid: String(args.widgetGuid).toLowerCase(),
    generatedAt,
    windows: {
      '7d': sumWindow(rows, d7, dayTo),
      '30d': sumWindow(rows, d30, dayTo),
    },
    parts,
  };
  const key = widgetDir(args.env, args.customerNumber, args.widgetGuid);
  const dir = path.join(args.root, ...String(key).split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'stats.json');
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  // Must never raise an agent job (#1343: stats_changed is not a trigger).
  if (args.agentQueue && typeof args.agentQueue.enqueue === 'function') {
    /* intentionally never call */
  }
  if (args.agentQueue && Array.isArray(args.agentQueue.messages)) {
    /* leave empty — pin asserts length 0 after write */
  }
  return { file, payload };
}

/**
 * @param {{
 *   statsStore: object,
 *   root: string,
 *   env: string,
 *   customerNumber: string,
 *   widgetGuids: string[],
 *   generatedAt?: string,
 * }} args
 */
function writeHostStatsJson(args) {
  const generatedAt = args.generatedAt || new Date().toISOString();
  const widgets = [];
  for (const g of args.widgetGuids || []) {
    const w = writeWidgetStatsJson({
      statsStore: args.statsStore,
      root: args.root,
      env: args.env,
      customerNumber: args.customerNumber,
      widgetGuid: g,
      generatedAt,
    });
    widgets.push({
      widgetGuid: w.payload.widgetGuid,
      layout: null,
      windows: w.payload.windows,
    });
  }
  const hostPayload = {
    generatedAt,
    windows: widgets[0] ? widgets[0].windows : {
      '7d': { views: 0, partImpressions: 0, clicks: 0, ctr: 0 },
      '30d': { views: 0, partImpressions: 0, clicks: 0, ctr: 0 },
    },
    widgets,
    topParts30d: [],
  };
  const key = hostDir(args.env, args.customerNumber);
  const dir = path.join(args.root, ...String(key).split('/').filter(Boolean));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'stats.json');
  fs.writeFileSync(file, `${JSON.stringify(hostPayload, null, 2)}\n`, 'utf8');
  return { file, payload: hostPayload };
}

module.exports = {
  ctr,
  writeWidgetStatsJson,
  writeHostStatsJson,
};
