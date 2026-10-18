'use strict';

/**
 * FR-198: page a widget's live.json (never trim by upgrade tier).
 * Paths via widgetPath; bootstrap via bootstrap.js; bind via customers store.
 */

const fs = require('node:fs');
const path = require('node:path');
const { assertWidgetGuid, widgetFile } = require('./widgetPath');
const { bootstrapHost, bootstrapWidget } = require('./bootstrap');
const {
  bindWidget,
  normalizeHost,
} = require('../components/customers');

class PartsError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'PartsError';
    this.code = code;
  }
}

/**
 * @param {unknown} raw
 * @param {number} fallback
 * @returns {number}
 */
function parseNonNegInt(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || Math.floor(n) !== n) {
    throw new PartsError('invalid_offset_or_n');
  }
  return n;
}

/**
 * Resolve OS path for a forward-slash key under root.
 * @param {string} root
 * @param {string} key
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * Read live.json array (empty if missing/invalid).
 * @param {string} absPath
 * @returns {object[]}
 */
function readLiveArray(absPath) {
  if (!fs.existsSync(absPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * Page parts for GET /parts.
 * @param {{
 *   root: string,
 *   env?: string,
 *   host: string,
 *   widgetGuid: string,
 *   offset?: number|string,
 *   n?: number|string,
 *   store: import('../components/customers').MemoryCustomersStore,
 *   layout?: string,
 *   createdVia?: string,
 * }} opts
 * @returns {{
 *   customerNumber: string,
 *   widgetGuid: string,
 *   layout: string,
 *   parts: object[],
 *   nextOffset: number|null,
 * }}
 */
function pageParts(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new PartsError('parts_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new PartsError('empty_root');
  if (!opts.store) throw new PartsError('store_required');

  const host = normalizeHost(opts.host);
  const guidRaw = opts.widgetGuid;
  if (guidRaw == null || String(guidRaw).trim() === '') {
    throw new PartsError('widget_guid_required');
  }
  let guid;
  try {
    guid = assertWidgetGuid(guidRaw);
  } catch {
    throw new PartsError('invalid_widget_guid');
  }

  const env =
    opts.env === 'live' || opts.env === 'sandbox' ? opts.env : 'sandbox';
  const offset = parseNonNegInt(opts.offset, 0);
  const n = parseNonNegInt(opts.n, 10);
  if (n === 0) {
    throw new PartsError('invalid_offset_or_n');
  }

  let widget;
  try {
    widget = bindWidget(opts.store, { widgetGuid: guid, host });
  } catch (err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'widget_host_mismatch') {
      throw new PartsError('widget_host_mismatch');
    }
    if (code === 'widget_not_found' || code === 'widget_removed') {
      throw new PartsError(code);
    }
    if (code === 'host_required') {
      throw new PartsError('host_required');
    }
    throw err;
  }

  const customerNumber = String(widget.customerNumber);
  const layout = widget.layout || opts.layout || 'horizontal';

  bootstrapHost({ root, env, customerNumber, host });
  bootstrapWidget({
    root,
    env,
    customerNumber,
    widgetGuid: guid,
    host,
    layout,
    createdVia: widget.createdVia || opts.createdVia || 'extension',
  });

  const liveKey = widgetFile(env, customerNumber, guid, 'live.json');
  const liveAbs = underRoot(root, liveKey);
  const all = readLiveArray(liveAbs);
  // Never trim by upgrade tier (FR-198 / #1345 agent owns cap on write).
  const slice = all.slice(offset, offset + n);
  const next = offset + n;
  const nextOffset = next < all.length ? next : null;

  return {
    customerNumber,
    widgetGuid: guid,
    layout,
    parts: slice,
    nextOffset,
  };
}

module.exports = {
  pageParts,
  PartsError,
  readLiveArray,
  parseNonNegInt,
};
