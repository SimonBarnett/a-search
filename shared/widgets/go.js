'use strict';

/**
 * FR-199: GET /go approved path - resolve part URL from one widget's live.json.
 * Keys: host + widgetGuid + part (+ optional cid). Never search other widgets.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertWidgetGuid, widgetFile } = require('./widgetPath');
const { readLiveArray } = require('./parts');
const {
  getWidget,
  getCustomerByHost,
  normalizeHost,
} = require('../components/customers');

class GoError extends Error {
  /**
   * @param {string} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'GoError';
    this.code = code;
  }
}

/**
 * @param {string} root
 * @param {string} key
 */
function underRoot(root, key) {
  return path.join(root, ...String(key).split('/').filter(Boolean));
}

/**
 * Find part by partNumber or id in live.json array.
 * @param {object[]} parts
 * @param {string} part
 * @returns {object|null}
 */
function findPart(parts, part) {
  const want = String(part || '').trim();
  if (!want) return null;
  for (const p of parts) {
    if (!p || typeof p !== 'object') continue;
    const pn = p.partNumber != null ? String(p.partNumber) : '';
    const id = p.id != null ? String(p.id) : '';
    if (pn === want || id === want) return p;
  }
  return null;
}

/**
 * Default outbound URL stamp (FR-248 lite for approved path).
 * merchant class -> plain destination; else require clubId + destination.
 * @param {{
 *   part: object,
 *   customer: object,
 *   clickId: string,
 *   env: string,
 * }} args
 * @returns {string}
 */
function defaultStampUrl(args) {
  const part = args.part || {};
  const dest =
    part.url != null
      ? String(part.url).trim()
      : part.href != null
        ? String(part.href).trim()
        : '';
  if (!dest) {
    throw new GoError('tracking_unavailable', 'part missing destination url');
  }
  const cls = String(part.class || part.Class || 'affiliate')
    .trim()
    .toLowerCase();
  if (cls === 'merchant') {
    return dest;
  }
  const clubId =
    args.customer && args.customer.clubId != null
      ? String(args.customer.clubId).trim()
      : '';
  if (!clubId) {
    throw new GoError('tracking_unavailable');
  }
  let parsed;
  try {
    parsed = new URL(dest);
  } catch {
    throw new GoError('tracking_unavailable', 'invalid destination url');
  }
  // Minimal stamp: tenant + clickId (full per-source table is FR-248).
  parsed.searchParams.set('tenantId', clubId);
  parsed.searchParams.set('clickId', args.clickId);
  if (args.env) parsed.searchParams.set('a_search_env', args.env);
  const partnerId =
    args.customer && args.customer.partnerId != null
      ? String(args.customer.partnerId).trim()
      : '';
  if (partnerId) parsed.searchParams.set('partnerId', partnerId);
  const source =
    part.source != null ? String(part.source).trim() : '';
  if (source) parsed.searchParams.set('source', source);
  return parsed.toString();
}

/**
 * Resolve approved /go click.
 * @param {{
 *   root: string,
 *   env?: string,
 *   host: string,
 *   widgetGuid: string,
 *   part: string,
 *   cid?: string,
 *   store: object,
 *   stampUrl?: Function,
 *   recordClick?: Function,
 *   prefetch?: boolean,
 * }} opts
 * @returns {Promise<{ url: string, clickId: string, recorded: boolean }>}
 */
async function resolveGo(opts) {
  if (!opts || typeof opts !== 'object') {
    throw new GoError('go_opts_required');
  }
  const root = opts.root == null ? '' : String(opts.root);
  if (!root) throw new GoError('empty_root');
  if (!opts.store) throw new GoError('store_required');

  const host = normalizeHost(opts.host);
  if (opts.widgetGuid == null || String(opts.widgetGuid).trim() === '') {
    throw new GoError('widget_guid_required');
  }
  let guid;
  try {
    guid = assertWidgetGuid(opts.widgetGuid);
  } catch {
    throw new GoError('invalid_widget_guid');
  }
  const partKey = opts.part == null ? '' : String(opts.part).trim();
  if (!partKey) throw new GoError('part_required');

  const env =
    opts.env === 'live' || opts.env === 'sandbox' ? opts.env : 'sandbox';

  const widget = getWidget(opts.store, guid);
  if (!widget || widget.status === 'removed') {
    throw new GoError('widget_not_found');
  }
  if (!widget.host || widget.host !== host) {
    throw new GoError('widget_host_mismatch');
  }
  if (!widget.customerNumber) {
    throw new GoError('widget_not_found');
  }

  const customer = getCustomerByHost(opts.store, host);
  if (!customer) {
    throw new GoError('host_not_approved');
  }
  if (!customer.approved) {
    // FR-200 owns signup / DNS path; approved-path FR returns closed shape.
    throw new GoError('host_not_approved');
  }

  const liveKey = widgetFile(
    env,
    widget.customerNumber,
    guid,
    'live.json',
  );
  const liveAbs = underRoot(root, liveKey);
  const parts = readLiveArray(liveAbs);
  const part = findPart(parts, partKey);
  if (!part) {
    throw new GoError('part_not_found');
  }

  const clickId =
    opts.cid != null && String(opts.cid).trim() !== ''
      ? String(opts.cid).trim()
      : `clk_${crypto.randomBytes(8).toString('hex')}`;

  const stamp =
    typeof opts.stampUrl === 'function' ? opts.stampUrl : defaultStampUrl;
  let url;
  try {
    url = stamp({
      part,
      customer,
      clickId,
      env,
      widgetGuid: guid,
      host,
    });
  } catch (err) {
    if (err instanceof GoError) throw err;
    const code = err && err.code ? String(err.code) : '';
    if (code === 'tracking_unavailable' || /tracked_url/.test(code)) {
      throw new GoError('tracking_unavailable');
    }
    throw err;
  }
  if (!url || String(url).trim() === '') {
    throw new GoError('tracking_unavailable');
  }

  let recorded = false;
  const skipRecord = opts.prefetch === true;
  if (!skipRecord && typeof opts.recordClick === 'function') {
    try {
      // Fire-and-forget with short timeout: do not delay redirect response.
      const p = Promise.resolve(
        opts.recordClick({
          type: 'click',
          source: 'server',
          widgetGuid: guid,
          partNumber: partKey,
          clickId,
          partnerId: customer.partnerId || null,
          env,
          at: new Date().toISOString(),
          host,
        }),
      );
      await Promise.race([
        p.then(() => {
          recorded = true;
        }),
        new Promise((resolve) => setTimeout(resolve, 25)),
      ]);
    } catch {
      // Log-only in real Lambda; unit path swallows.
      recorded = false;
    }
  }

  return { url: String(url), clickId, recorded };
}

module.exports = {
  resolveGo,
  GoError,
  findPart,
  defaultStampUrl,
};
