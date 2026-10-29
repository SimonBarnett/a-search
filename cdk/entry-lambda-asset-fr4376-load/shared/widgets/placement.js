'use strict';

/**
 * FR-221: runtime placement from the host page.
 * Widget key is data-widget-guid; host comes from location.host.
 * pathname / URI is diagnostics only (not a storage key; FR-232).
 */

const { isValidWidgetGuid } = require('./snippet');

const LAYOUTS = new Set(['horizontal', 'vertical', 'fullscreen']);

/**
 * @param {{ getAttribute: (name: string) => string|null }} element
 * @returns {string}
 */
function readWidgetGuidFromElement(element) {
  const raw =
    element && typeof element.getAttribute === 'function'
      ? element.getAttribute('data-widget-guid')
      : null;
  const guid = raw == null ? '' : String(raw).trim().toLowerCase();
  if (!isValidWidgetGuid(guid)) {
    const err = new Error('widget_guid_required');
    err.code = 'widget_guid_required';
    throw err;
  }
  return guid;
}

/**
 * @param {{
 *   location: { host?: string, hostname?: string, pathname?: string },
 *   element: { getAttribute: (name: string) => string|null },
 * }} args
 */
function resolvePlacement(args) {
  const loc = args.location || {};
  const host = String(loc.host || loc.hostname || '')
    .trim()
    .toLowerCase();
  if (!host) {
    const err = new Error('host_required');
    err.code = 'host_required';
    throw err;
  }
  const widgetGuid = readWidgetGuidFromElement(args.element);
  const modeRaw =
    args.element && typeof args.element.getAttribute === 'function'
      ? args.element.getAttribute('data-mode')
      : null;
  let layout = modeRaw == null ? 'horizontal' : String(modeRaw).trim();
  if (!LAYOUTS.has(layout)) layout = 'horizontal';
  const pathname = String(loc.pathname || '');
  return {
    host,
    widgetGuid,
    layout,
    pathname,
    /** Diagnostics only -- never used as the widget storage key. */
    uriDiagnostics: pathname,
  };
}

module.exports = {
  readWidgetGuidFromElement,
  resolvePlacement,
};
