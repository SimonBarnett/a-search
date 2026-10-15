'use strict';

/**
 * FR-219 / FR-232 prelude: mint widgetGuid + embed snippet for copy pages.
 * Full Widgets SQL registry / bind is FR-232; in-memory store for mint tests.
 */

const crypto = require('node:crypto');

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const LAYOUTS = new Set(['horizontal', 'vertical', 'fullscreen']);
const CREATED_VIA = new Set(['extension', 'smartcatalogue', 'clubmadeira']);

const DEFAULT_WIDGET_JS_URL =
  'https://cdn.smartcatalogue.uk/a-search-widget.js';

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isValidWidgetGuid(value) {
  if (typeof value !== 'string') return false;
  return WIDGET_GUID_RE.test(value);
}

/**
 * @returns {string} lowercase UUID v4
 */
function mintWidgetGuid() {
  return crypto.randomUUID().toLowerCase();
}

/**
 * @param {{ widgetGuid: string, layout: string, widgetJsUrl?: string }} args
 */
function buildEmbedSnippet(args) {
  const guid = String(args.widgetGuid).toLowerCase();
  if (!isValidWidgetGuid(guid)) {
    const err = new Error('invalid_widget_guid');
    err.code = 'invalid_widget_guid';
    throw err;
  }
  const layout = String(args.layout || 'horizontal');
  if (!LAYOUTS.has(layout)) {
    const err = new Error('invalid_layout');
    err.code = 'invalid_layout';
    throw err;
  }
  const src = String(args.widgetJsUrl || DEFAULT_WIDGET_JS_URL);
  return (
    '<div class="a-search-widget" data-widget-guid="' +
    guid +
    '" data-mode="' +
    layout +
    '"></div>\n' +
    '<script src="' +
    src +
    '" async></script>'
  );
}

function createWidgetsRegistry() {
  /** @type {object[]} */
  const rows = [];
  return {
    insert(row) {
      rows.push(row);
      return row;
    },
    list() {
      return rows.slice();
    },
  };
}

/**
 * @param {{
 *   layout: string,
 *   createdVia: string,
 *   host?: string,
 *   createdByUserId?: string|null,
 *   registry: ReturnType<typeof createWidgetsRegistry>,
 *   widgetJsUrl?: string,
 *   nowMs?: number,
 * }} args
 */
function createWidget(args) {
  const layout = String(args.layout || '').trim();
  if (!LAYOUTS.has(layout)) {
    const err = new Error('invalid_layout');
    err.code = 'invalid_layout';
    throw err;
  }
  const createdVia = String(args.createdVia || '').trim();
  if (!CREATED_VIA.has(createdVia)) {
    const err = new Error('invalid_created_via');
    err.code = 'invalid_created_via';
    throw err;
  }
  const widgetGuid = mintWidgetGuid();
  const snippet = buildEmbedSnippet({
    widgetGuid,
    layout,
    widgetJsUrl: args.widgetJsUrl,
  });
  const row = {
    widgetGuid,
    customerNumber: null,
    host: args.host ? String(args.host) : null,
    layout,
    createdVia,
    createdByUserId: args.createdByUserId != null ? String(args.createdByUserId) : null,
    createdAt: args.nowMs != null ? Number(args.nowMs) : Date.now(),
    boundAt: null,
    status: 'active',
  };
  args.registry.insert(row);
  return { widgetGuid, layout, snippet };
}

module.exports = {
  WIDGET_GUID_RE,
  LAYOUTS,
  CREATED_VIA,
  DEFAULT_WIDGET_JS_URL,
  isValidWidgetGuid,
  mintWidgetGuid,
  buildEmbedSnippet,
  createWidgetsRegistry,
  createWidget,
};
