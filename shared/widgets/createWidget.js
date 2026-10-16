'use strict';

/**
 * FR-232 / FR-219: mint widgetGuid + embed snippet.
 * Prefer Customers/Widgets store (bind-at-mint when host set); optional
 * createWidgetsRegistry remains for FR-219 list() pins.
 */

const crypto = require('node:crypto');
const {
  createWidget: storeCreateWidget,
  getDefaultCustomersStore,
} = require('../components/customers');

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
 *   registry?: ReturnType<typeof createWidgetsRegistry>,
 *   store?: object,
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

  const store = args.store || getDefaultCustomersStore();
  const row = storeCreateWidget(store, {
    layout,
    createdVia,
    host: args.host,
    createdByUserId: args.createdByUserId,
  });

  const snippet = buildEmbedSnippet({
    widgetGuid: row.widgetGuid,
    layout: row.layout,
    widgetJsUrl: args.widgetJsUrl,
  });

  if (args.registry) {
    args.registry.insert({
      widgetGuid: row.widgetGuid,
      customerNumber: row.customerNumber,
      host: row.host,
      layout: row.layout,
      createdVia: row.createdVia,
      createdByUserId: row.createdByUserId,
      createdAt: args.nowMs != null ? Number(args.nowMs) : row.createdAt,
      boundAt: row.boundAt,
      status: row.status,
    });
  }

  return {
    widgetGuid: row.widgetGuid,
    layout: row.layout,
    snippet,
    customerNumber: row.customerNumber,
    host: row.host,
    boundAt: row.boundAt,
  };
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
