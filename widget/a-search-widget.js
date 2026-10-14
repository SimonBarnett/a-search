'use strict';

/**
 * FR-221: embed loader -- self-configures from placement host.
 * Boots every .a-search-widget[data-widget-guid] once.
 * Host from location.host; widget key from data-widget-guid (not URI).
 * Parts paging / go wiring: FR-201 / siblings (out of scope here).
 */

(function (global) {
  var SELECTOR = '.a-search-widget[data-widget-guid]';
  var BOOTED = 'data-a-search-booted';

  var WIDGET_GUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  function isValidWidgetGuid(value) {
    return typeof value === 'string' && WIDGET_GUID_RE.test(value);
  }

  /**
   * Mirrors shared/widgets/placement.resolvePlacement for the browser bundle.
   * @param {Location} location
   * @param {Element} element
   */
  function resolvePlacement(location, element) {
    var host = String(
      (location && (location.host || location.hostname)) || '',
    )
      .trim()
      .toLowerCase();
    var guid = String(
      (element && element.getAttribute('data-widget-guid')) || '',
    )
      .trim()
      .toLowerCase();
    if (!host) throw new Error('host_required');
    if (!isValidWidgetGuid(guid)) throw new Error('widget_guid_required');
    var layout = String(
      (element && element.getAttribute('data-mode')) || 'horizontal',
    ).trim();
    if (
      layout !== 'horizontal' &&
      layout !== 'vertical' &&
      layout !== 'fullscreen'
    ) {
      layout = 'horizontal';
    }
    return {
      host: host,
      widgetGuid: guid,
      layout: layout,
      pathname: String((location && location.pathname) || ''),
      uriDiagnostics: String((location && location.pathname) || ''),
    };
  }

  function bootOne(element) {
    if (!element || element.getAttribute(BOOTED) === '1') return;
    var placement = resolvePlacement(global.location, element);
    element.setAttribute(BOOTED, '1');
    element.setAttribute('data-a-search-host', placement.host);
    element.setAttribute('data-a-search-layout', placement.layout);
    // FR-201 owns Parts fetch; this FR only pins self-config.
    if (typeof element.dispatchEvent === 'function') {
      try {
        element.dispatchEvent(
          new CustomEvent('a-search-placement', {
            detail: {
              host: placement.host,
              widgetGuid: placement.widgetGuid,
              layout: placement.layout,
              pathname: placement.pathname,
            },
          }),
        );
      } catch (e) {
        void e;
      }
    }
  }

  function bootAll() {
    var nodes = global.document
      ? global.document.querySelectorAll(SELECTOR)
      : [];
    for (var i = 0; i < nodes.length; i += 1) {
      try {
        bootOne(nodes[i]);
      } catch (e) {
        if (global.console && global.console.warn) {
          global.console.warn('a-search-widget boot', e && e.message);
        }
      }
    }
  }

  if (global.document && global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', bootAll);
  } else {
    bootAll();
  }

  global.ASearchWidget = {
    resolvePlacement: resolvePlacement,
    bootAll: bootAll,
  };
})(
  typeof window !== 'undefined'
    ? window
    : typeof global !== 'undefined'
      ? global
      : this,
);
