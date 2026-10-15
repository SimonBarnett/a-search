'use strict';

/**
 * #1344: PATCH widget layout with upgrade gate for fullscreen.
 */

const { LAYOUTS, isValidWidgetGuid } = require('./createWidget');

/**
 * Extend in-memory registry with get/update.
 * @param {ReturnType<import('./createWidget').createWidgetsRegistry>} registry
 */
function withWidgetLookup(registry) {
  const base = registry || { insert() {}, list() { return []; } };
  /** @type {Map<string, object>} */
  const byGuid = new Map();
  for (const row of base.list()) {
    if (row && row.widgetGuid) byGuid.set(String(row.widgetGuid).toLowerCase(), row);
  }
  return {
    insert(row) {
      const saved = base.insert(row);
      byGuid.set(String(saved.widgetGuid).toLowerCase(), saved);
      return saved;
    },
    list() {
      return base.list();
    },
    get(widgetGuid) {
      return byGuid.get(String(widgetGuid).toLowerCase()) || null;
    },
    update(widgetGuid, patch) {
      const key = String(widgetGuid).toLowerCase();
      const cur = byGuid.get(key);
      if (!cur) return null;
      Object.assign(cur, patch);
      byGuid.set(key, cur);
      return cur;
    },
  };
}

/**
 * @param {{
 *   widgetGuid: string,
 *   layout: string,
 *   host?: string,
 *   registry: ReturnType<typeof withWidgetLookup>,
 *   isHostUpgraded?: (host: string) => boolean,
 *   jwtHost?: string,
 * }} args
 */
function patchWidgetLayout(args) {
  const guid = String(args.widgetGuid || '').toLowerCase();
  if (!isValidWidgetGuid(guid)) {
    const err = new Error('invalid_widget_guid');
    err.code = 'invalid_widget_guid';
    throw err;
  }
  const layout = String(args.layout || '').trim();
  if (!LAYOUTS.has(layout)) {
    const err = new Error('invalid_layout');
    err.code = 'invalid_layout';
    throw err;
  }
  const row = args.registry.get(guid);
  if (!row) {
    const err = new Error('widget_not_found');
    err.code = 'widget_not_found';
    throw err;
  }
  const rowHost = row.host ? String(row.host).toLowerCase() : '';
  const jwtHost = args.jwtHost ? String(args.jwtHost).toLowerCase() : '';
  if (rowHost && jwtHost && rowHost !== jwtHost) {
    const err = new Error('widget_host_mismatch');
    err.code = 'widget_host_mismatch';
    throw err;
  }
  if (layout === 'fullscreen') {
    const host = jwtHost || rowHost || String(args.host || '').toLowerCase();
    const upgraded =
      typeof args.isHostUpgraded === 'function' ? args.isHostUpgraded(host) : false;
    if (!upgraded) {
      const err = new Error('upgrade_required');
      err.code = 'upgrade_required';
      throw err;
    }
  }
  return args.registry.update(guid, { layout });
}

module.exports = {
  withWidgetLookup,
  patchWidgetLayout,
};
