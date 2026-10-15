'use strict';

/**
 * FR-221 / FR-232 rule 4: shared embed snippet template.
 * No host in the snippet -- runtime uses location.host (FR-221).
 */

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const LAYOUTS = new Set(['horizontal', 'vertical', 'fullscreen']);

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
 * @param {{ widgetGuid: string, layout: string, widgetJsUrl?: string }} args
 * @returns {string}
 */
function buildEmbedSnippet(args) {
  const guid = String(args.widgetGuid || '')
    .trim()
    .toLowerCase();
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

module.exports = {
  WIDGET_GUID_RE,
  LAYOUTS,
  DEFAULT_WIDGET_JS_URL,
  isValidWidgetGuid,
  buildEmbedSnippet,
};
