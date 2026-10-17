'use strict';

/**
 * FR-234: validate POST /w/events batch and apply (or enqueue) widget telemetry.
 */

const { isBotUserAgent } = require('./botPatterns');
const { assertWidgetGuid } = require('../widgets/widgetPath');
const {
  getWidget,
  getCustomerByHost,
  normalizeHost,
} = require('../components/customers');

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 50;
const EVENT_TYPES = new Set(['view', 'part_impression', 'click']);

/**
 * @param {string|Date|number} at
 * @param {number} nowMs
 * @returns {boolean}
 */
function atInWindow(at, nowMs) {
  const t = Date.parse(String(at || ''));
  if (!Number.isFinite(t)) return false;
  const min = nowMs - 24 * 60 * 60 * 1000;
  const max = nowMs + 5 * 60 * 1000;
  return t >= min && t <= max;
}

/**
 * @param {string} dayIso
 */
function dayKey(dayIso) {
  const d = new Date(dayIso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/**
 * @param {{
 *   body: object|string,
 *   headers?: object,
 *   store: object,
 *   statsStore: object,
 *   env?: string,
 *   nowMs?: number,
 *   enqueue?: (msg: object) => void|Promise<void>,
 *   applyInline?: boolean,
 *   originHost?: string,
 *   webdriver?: boolean,
 * }} args
 */
async function ingestWidgetEventsBatch(args) {
  const nowMs = args.nowMs != null ? Number(args.nowMs) : Date.now();
  const statsStore = args.statsStore;
  const customers = args.store;
  const env = args.env === 'live' ? 'live' : 'sandbox';
  const headers = args.headers || {};
  const ua =
    headers['user-agent'] ||
    headers['User-Agent'] ||
    headers['USER-AGENT'] ||
    '';

  let raw = args.body;
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      const err = new Error('payload_too_large');
      err.code = 'payload_too_large';
      err.statusCode = 413;
      throw err;
    }
    try {
      raw = JSON.parse(raw);
    } catch {
      const err = new Error('malformed_json');
      err.code = 'malformed_json';
      err.statusCode = 400;
      throw err;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const err = new Error('malformed_shape');
    err.code = 'malformed_shape';
    err.statusCode = 400;
    throw err;
  }
  if (raw.v !== 1) {
    const err = new Error('malformed_shape');
    err.code = 'malformed_shape';
    err.statusCode = 400;
    throw err;
  }
  if (!Array.isArray(raw.events) || raw.events.length > MAX_EVENTS) {
    const err = new Error('malformed_shape');
    err.code = 'malformed_shape';
    err.statusCode = 400;
    throw err;
  }

  if (args.webdriver === true || raw.wd === 1 || raw.wd === true) {
    statsStore.bumpDropped('webdriver');
    return { statusCode: 204, applied: 0, dropped: raw.events.length };
  }
  if (isBotUserAgent(ua)) {
    statsStore.bumpDropped('bot_ua');
    return { statusCode: 204, applied: 0, dropped: raw.events.length };
  }

  let host;
  try {
    host = normalizeHost(raw.host);
  } catch {
    const err = new Error('malformed_shape');
    err.code = 'malformed_shape';
    err.statusCode = 400;
    throw err;
  }
  const originHost = args.originHost != null ? String(args.originHost) : '';
  if (originHost) {
    let oh;
    try {
      oh = normalizeHost(originHost);
    } catch {
      oh = '';
    }
    if (oh && oh !== host) {
      statsStore.bumpDropped('host_mismatch');
      return { statusCode: 204, applied: 0, dropped: raw.events.length };
    }
  }

  const pageViewId = String(raw.pageViewId || '').trim();
  if (!pageViewId) {
    const err = new Error('malformed_shape');
    err.code = 'malformed_shape';
    err.statusCode = 400;
    throw err;
  }

  const cust = getCustomerByHost(customers, host);
  const customerNumber = cust ? String(cust.customerNumber) : '';
  const tenantId =
    cust && cust.clubId != null && String(cust.clubId).trim() !== ''
      ? String(cust.clubId).trim()
      : null;

  const applyInline =
    args.applyInline === true || typeof args.enqueue !== 'function';
  const accepted = [];
  for (const ev of raw.events) {
    if (!ev || typeof ev !== 'object') {
      statsStore.bumpDropped('bad_event');
      continue;
    }
    const type = String(ev.type || '').trim();
    if (!EVENT_TYPES.has(type)) {
      statsStore.bumpDropped('bad_type');
      continue;
    }
    let widgetGuid;
    try {
      widgetGuid = assertWidgetGuid(ev.widgetGuid);
    } catch {
      statsStore.bumpDropped('invalid_widget_guid');
      continue;
    }
    const w = getWidget(customers, widgetGuid);
    if (!w || (w.host && normalizeHost(w.host) !== host)) {
      statsStore.bumpDropped('widget_host_mismatch');
      continue;
    }
    if (!atInWindow(ev.at, nowMs)) {
      statsStore.bumpDropped('at_out_of_window');
      continue;
    }
    const partNumber =
      ev.partNumber == null || String(ev.partNumber).trim() === ''
        ? null
        : String(ev.partNumber).trim();
    if (
      (type === 'part_impression' || type === 'click') &&
      (partNumber == null || partNumber === '')
    ) {
      statsStore.bumpDropped('part_required');
      continue;
    }
    const clickId =
      ev.clickId == null || String(ev.clickId).trim() === ''
        ? null
        : String(ev.clickId).trim();
    if (type === 'click' && !clickId) {
      statsStore.bumpDropped('clickId_required');
      continue;
    }
    accepted.push({
      type,
      widgetGuid,
      partNumber,
      clickId,
      at: String(ev.at),
      pageViewId,
      host,
      customerNumber: customerNumber || (w.customerNumber != null ? String(w.customerNumber) : ''),
      tenantId,
      env,
      source: 'client',
    });
  }

  if (!applyInline && typeof args.enqueue === 'function') {
    await args.enqueue({
      v: 1,
      env,
      host,
      pageViewId,
      events: accepted,
    });
    return { statusCode: 204, applied: 0, enqueued: accepted.length, dropped: 0 };
  }

  let applied = 0;
  for (const ev of accepted) {
    applied += applyOneEvent(statsStore, ev, nowMs) ? 1 : 0;
  }
  return { statusCode: 204, applied, dropped: raw.events.length - accepted.length };
}

/**
 * @param {object} statsStore
 * @param {object} ev
 * @param {number} nowMs
 * @returns {boolean}
 */
function applyOneEvent(statsStore, ev, nowMs) {
  const day = dayKey(ev.at);
  const expires = nowMs + 48 * 60 * 60 * 1000;
  if (ev.type === 'view') {
    const key = `view|${ev.pageViewId}|${ev.widgetGuid}`;
    if (!statsStore.tryDedupe(key, expires, nowMs)) return false;
    statsStore.upsertDaily({
      env: ev.env,
      customerNumber: ev.customerNumber,
      widgetGuid: ev.widgetGuid,
      partNumber: '',
      day,
      tenantId: ev.tenantId,
      views: 1,
    });
    return true;
  }
  if (ev.type === 'part_impression') {
    const key = `imp|${ev.pageViewId}|${ev.widgetGuid}|${ev.partNumber}`;
    if (!statsStore.tryDedupe(key, expires, nowMs)) return false;
    statsStore.upsertDaily({
      env: ev.env,
      customerNumber: ev.customerNumber,
      widgetGuid: ev.widgetGuid,
      partNumber: ev.partNumber,
      day,
      tenantId: ev.tenantId,
      partImpressions: 1,
    });
    return true;
  }
  if (ev.type === 'click') {
    const key = `click|${ev.clickId}`;
    if (!statsStore.tryDedupe(key, expires, nowMs)) return false;
    const server = ev.source === 'server';
    const clickPatch = {
      env: ev.env,
      customerNumber: ev.customerNumber,
      widgetGuid: ev.widgetGuid,
      day,
      tenantId: ev.tenantId,
      clicks: 1,
      clicksServer: server ? 1 : 0,
      clicksClientOnly: server ? 0 : 1,
    };
    // Widget-level click counter (partNumber '').
    statsStore.upsertDaily({ ...clickPatch, partNumber: '' });
    if (ev.partNumber) {
      statsStore.upsertDaily({ ...clickPatch, partNumber: ev.partNumber });
    }
    return true;
  }
  return false;
}

/**
 * Server-side /go click (authoritative when cid present).
 * @param {{
 *   statsStore: object,
 *   env: string,
 *   customerNumber: string,
 *   widgetGuid: string,
 *   partNumber: string,
 *   clickId: string,
 *   tenantId?: string|null,
 *   nowMs?: number,
 * }} args
 */
function recordServerClick(args) {
  const nowMs = args.nowMs != null ? Number(args.nowMs) : Date.now();
  return applyOneEvent(
    args.statsStore,
    {
      type: 'click',
      widgetGuid: String(args.widgetGuid).toLowerCase(),
      partNumber: String(args.partNumber || ''),
      clickId: String(args.clickId),
      at: new Date(nowMs).toISOString(),
      pageViewId: 'server',
      customerNumber: String(args.customerNumber || ''),
      tenantId: args.tenantId != null ? args.tenantId : null,
      env: args.env === 'live' ? 'live' : 'sandbox',
      source: 'server',
    },
    nowMs,
  );
}

module.exports = {
  MAX_BODY_BYTES,
  MAX_EVENTS,
  ingestWidgetEventsBatch,
  applyOneEvent,
  recordServerClick,
  dayKey,
  atInWindow,
};
