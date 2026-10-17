'use strict';

/**
 * FR-234: in-memory WidgetStatsDaily + WidgetEventDedupe for unit tests.
 * Production adapter swaps to MSSQL MERGE (a_search / a_search_sandbox only).
 */

class MemoryWidgetStatsStore {
  constructor() {
    /** @type {Map<string, object>} */
    this.daily = new Map();
    /** @type {Map<string, number>} expiresAt ms */
    this.dedupe = new Map();
    /** @type {Map<string, number>} drop reason counters */
    this.dropped = new Map();
    /** @type {string[]} */
    this.logLines = [];
  }

  /**
   * @param {string} reason
   */
  bumpDropped(reason) {
    const r = String(reason || 'unknown');
    this.dropped.set(r, (this.dropped.get(r) || 0) + 1);
  }

  /**
   * @param {string} key
   * @param {number} expiresAtMs
   * @param {number} [nowMs]
   * @returns {boolean} true if newly recorded (not a duplicate)
   */
  tryDedupe(key, expiresAtMs, nowMs) {
    const k = String(key || '');
    const now = nowMs != null ? Number(nowMs) : Date.now();
    for (const [dk, exp] of [...this.dedupe.entries()]) {
      if (exp <= now) this.dedupe.delete(dk);
    }
    if (this.dedupe.has(k)) return false;
    this.dedupe.set(k, expiresAtMs);
    return true;
  }

  /**
   * @param {{
   *   env: string,
   *   customerNumber: string,
   *   widgetGuid: string,
   *   partNumber?: string,
   *   day: string,
   *   partClass?: string,
   *   tenantId?: string|null,
   *   views?: number,
   *   partImpressions?: number,
   *   clicks?: number,
   *   clicksServer?: number,
   *   clicksClientOnly?: number,
   * }} patch
   */
  upsertDaily(patch) {
    const env = String(patch.env || '');
    const widgetGuid = String(patch.widgetGuid || '').toLowerCase();
    const partNumber =
      patch.partNumber == null || String(patch.partNumber).trim() === ''
        ? ''
        : String(patch.partNumber).trim();
    const day = String(patch.day || '');
    const partClass =
      patch.partClass == null || String(patch.partClass).trim() === ''
        ? 'affiliate'
        : String(patch.partClass).trim().toLowerCase();
    const key = [env, widgetGuid, partNumber, day, partClass].join('|');
    const prev = this.daily.get(key) || {
      env,
      customerNumber: String(patch.customerNumber || ''),
      widgetGuid,
      partNumber,
      day,
      partClass,
      tenantId:
        patch.tenantId == null || String(patch.tenantId).trim() === ''
          ? null
          : String(patch.tenantId).trim(),
      views: 0,
      partImpressions: 0,
      clicks: 0,
      clicksServer: 0,
      clicksClientOnly: 0,
    };
    if (patch.customerNumber != null) {
      prev.customerNumber = String(patch.customerNumber);
    }
    if (patch.tenantId !== undefined) {
      prev.tenantId =
        patch.tenantId == null || String(patch.tenantId).trim() === ''
          ? null
          : String(patch.tenantId).trim();
    }
    prev.views += Number(patch.views) || 0;
    prev.partImpressions += Number(patch.partImpressions) || 0;
    prev.clicks += Number(patch.clicks) || 0;
    prev.clicksServer += Number(patch.clicksServer) || 0;
    prev.clicksClientOnly += Number(patch.clicksClientOnly) || 0;
    this.daily.set(key, prev);
    return { ...prev };
  }

  /**
   * @param {{ env: string, widgetGuid: string, fromDay: string, toDay: string }} q
   */
  listDaily(q) {
    const env = String(q.env || '');
    const widgetGuid = String(q.widgetGuid || '').toLowerCase();
    const fromDay = String(q.fromDay || '');
    const toDay = String(q.toDay || '');
    const out = [];
    for (const row of this.daily.values()) {
      if (row.env !== env) continue;
      if (widgetGuid && row.widgetGuid !== widgetGuid) continue;
      if (fromDay && row.day < fromDay) continue;
      if (toDay && row.day > toDay) continue;
      out.push({ ...row });
    }
    return out;
  }

  /**
   * Pin helper: schema/log must never persist IP / UA / user id.
   * @returns {string}
   */
  dumpForSecretScan() {
    return JSON.stringify({
      daily: [...this.daily.values()],
      dedupeKeys: [...this.dedupe.keys()],
      logLines: this.logLines,
    });
  }
}

/** @type {MemoryWidgetStatsStore|null} */
let defaultStore = null;

function getDefaultWidgetStatsStore() {
  if (!defaultStore) defaultStore = new MemoryWidgetStatsStore();
  return defaultStore;
}

function setDefaultWidgetStatsStore(store) {
  defaultStore = store || null;
}

module.exports = {
  MemoryWidgetStatsStore,
  getDefaultWidgetStatsStore,
  setDefaultWidgetStatsStore,
};
