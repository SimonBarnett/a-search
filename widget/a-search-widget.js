'use strict';

/**
 * FR-201 + FR-203 (+ FR-221 placement: host from location.host; key is data-widget-guid).
 * FR-201 + FR-203 (+ FR-221): embeddable ComponentsPiece widget. Host from location.host; widget key is data-widget-guid (not URI).
 * Boots every .a-search-widget[data-widget-guid] once; pages GET /parts.
 * Layout from Parts API; fall back to data-mode.
 * FR-203: View deal -> GET /go?host&widgetGuid&part; never embed affiliate hrefs.
 */

var SELECTOR = '.a-search-widget[data-widget-guid]';
var BOOTED_ATTR = 'data-a-search-booted';
var GO_BOUND_ATTR = 'data-a-search-go-bound';
var DEFAULT_N = 10;

/**
 * @param {string} apiBase
 * @param {{
 *   host: string,
 *   widgetGuid: string,
 *   offset?: number,
 *   n?: number,
 *   uri?: string,
 * }} q
 * @returns {string}
 */
function buildPartsUrl(apiBase, q) {
  var base = apiBase == null ? '' : String(apiBase).replace(/\/$/, '');
  var path = base + '/parts';
  var params = [];
  params.push('host=' + encodeURIComponent(q.host));
  params.push('widgetGuid=' + encodeURIComponent(q.widgetGuid));
  params.push('offset=' + encodeURIComponent(String(q.offset == null ? 0 : q.offset)));
  params.push('n=' + encodeURIComponent(String(q.n == null ? DEFAULT_N : q.n)));
  if (q.uri != null && String(q.uri) !== '') {
    params.push('uri=' + encodeURIComponent(String(q.uri)));
  }
  return path + '?' + params.join('&');
}

/**
 * Build GET /go URL. Identity is host + widgetGuid + part (FR-232 / FR-203).
 * @param {string} apiBase
 * @param {{ host: string, widgetGuid: string, part: string }} q
 * @returns {string}
 */
function buildGoUrl(apiBase, q) {
  var base = apiBase == null ? '' : String(apiBase).replace(/\/$/, '');
  var path = base + '/go';
  var params = [];
  params.push('host=' + encodeURIComponent(q.host));
  params.push('widgetGuid=' + encodeURIComponent(q.widgetGuid));
  params.push('part=' + encodeURIComponent(q.part));
  return path + '?' + params.join('&');
}

/**
 * @param {object[]} parts
 * @returns {string}
 */
function partsHtml(parts) {
  if (!parts || !parts.length) {
    return '<div class="empty-msg">No deals for this page yet. Check back soon.</div>';
  }
  return parts
    .map(function (p) {
      var partKey =
        p && p.partNumber != null
          ? String(p.partNumber)
          : p && p.id != null
            ? String(p.id)
            : '';
      var title =
        p && p.title != null
          ? String(p.title)
          : p && p.name != null
            ? String(p.name)
            : partKey || 'Part';
      var meta = '';
      if (p && p.price != null) meta += String(p.price);
      if (p && (p.merchant || p.source)) {
        if (meta) meta += ' ? ';
        meta += String(p.merchant || p.source);
      }
      var img =
        p && p.image != null
          ? String(p.image)
          : p && p.img != null
            ? String(p.img)
            : '';
      var imgTag = img
        ? '<img alt="" src="' + escapeAttr(img) + '" />'
        : '<img alt="" src="" />';
      return (
        '<div class="part" data-part="' +
        escapeAttr(partKey) +
        '">' +
        imgTag +
        '<div class="title">' +
        escapeHtml(title) +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(meta) +
        '</div>' +
        '<button type="button" data-action="go">View deal</button>' +
        '</div>'
      );
    })
    .join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, '&#39;');
}

/**
 * Resolve layout: API layout wins; else element data-mode; else horizontal.
 * @param {string|null|undefined} apiLayout
 * @param {string|null|undefined} dataMode
 */
function resolveLayout(apiLayout, dataMode) {
  var a = apiLayout != null ? String(apiLayout).trim() : '';
  if (a === 'horizontal' || a === 'vertical' || a === 'fullscreen') return a;
  var m = dataMode != null ? String(dataMode).trim() : '';
  if (m === 'horizontal' || m === 'vertical' || m === 'fullscreen') return m;
  return 'horizontal';
}

/**
 * @param {Element} el
 * @param {object} page Parts API body
 * @param {string} fallbackMode
 */
function renderPage(el, page, fallbackMode) {
  var layout = resolveLayout(page && page.layout, fallbackMode);
  el.setAttribute('data-mode', layout);
  var parts = page && Array.isArray(page.parts) ? page.parts : [];
  if (!parts.length) {
    el.setAttribute('data-state', 'empty');
  } else {
    el.setAttribute('data-state', 'ok');
  }
  el.innerHTML = partsHtml(parts);
  if (page && page.nextOffset != null) {
    el.setAttribute('data-next-offset', String(page.nextOffset));
  } else {
    el.removeAttribute('data-next-offset');
  }
  if (layout === 'fullscreen' && page && page.nextOffset != null) {
    var more = el.ownerDocument.createElement('button');
    more.type = 'button';
    more.setAttribute('data-action', 'page-more');
    more.textContent = 'More';
    el.appendChild(more);
  }
}

/**
 * Fetch one Parts page.
 * @param {{
 *   fetch: Function,
 *   apiBase: string,
 *   host: string,
 *   widgetGuid: string,
 *   offset?: number,
 *   n?: number,
 *   uri?: string,
 * }} opts
 */
async function fetchPartsPage(opts) {
  var url = buildPartsUrl(opts.apiBase, {
    host: opts.host,
    widgetGuid: opts.widgetGuid,
    offset: opts.offset,
    n: opts.n,
    uri: opts.uri,
  });
  var res = await opts.fetch(url, { method: 'GET', credentials: 'omit' });
  if (!res || !res.ok) {
    var err = new Error('parts_http_' + (res && res.status));
    err.code = 'parts_http_error';
    throw err;
  }
  return res.json();
}

/**
 * Default open helper: new browsing context with noopener.
 * @param {string} url
 */
function defaultOpenUrl(url) {
  if (typeof globalThis !== 'undefined' && typeof globalThis.open === 'function') {
    return globalThis.open(url, '_blank', 'noopener,noreferrer');
  }
  throw new Error('open_unavailable');
}

/**
 * FR-203: fetch /go and open returned url. Never uses part.href from markup.
 * @param {Element} widgetEl
 * @param {string} partKey
 * @param {object} deps
 */
async function clickGo(widgetEl, partKey, deps) {
  deps = deps || {};
  var guid = widgetEl && widgetEl.getAttribute('data-widget-guid');
  if (!guid) {
    var eg = new Error('widget_guid_required');
    eg.code = 'widget_guid_required';
    throw eg;
  }
  var part = partKey != null ? String(partKey).trim() : '';
  if (!part) {
    var ep = new Error('part_required');
    ep.code = 'part_required';
    throw ep;
  }
  var host =
    (deps.location && deps.location.host) ||
    widgetEl.getAttribute('data-host') ||
    '';
  if (!host) {
    var eh = new Error('host_required');
    eh.code = 'host_required';
    throw eh;
  }
  var apiBase =
    deps.apiBase != null
      ? String(deps.apiBase)
      : widgetEl.getAttribute('data-api-base') || '';
  var goUrl = buildGoUrl(apiBase, {
    host: host,
    widgetGuid: guid,
    part: part,
  });
  var res = await deps.fetch(goUrl, { method: 'GET', credentials: 'omit' });
  if (!res || !res.ok) {
    var err = new Error('go_http_' + (res && res.status));
    err.code = 'go_http_error';
    throw err;
  }
  var body = await res.json();
  var dest = body && body.url != null ? String(body.url).trim() : '';
  if (!dest) {
    var eu = new Error('go_url_missing');
    eu.code = 'go_url_missing';
    throw eu;
  }
  var openFn = typeof deps.openUrl === 'function' ? deps.openUrl : defaultOpenUrl;
  openFn(dest);
  return body;
}

/**
 * Walk up from event target to find data-action="go" and its .part[data-part].
 * @param {Element|null} start
 * @param {Element} root
 * @returns {{ action: string, part: string }|null}
 */
function findGoTarget(start, root) {
  var node = start;
  var actionEl = null;
  while (node && node !== root) {
    if (node.getAttribute && node.getAttribute('data-action') === 'go') {
      actionEl = node;
      break;
    }
    node = node.parentNode || node.parentElement || null;
  }
  if (!actionEl) return null;
  node = actionEl;
  while (node && node !== root) {
    if (node.getAttribute) {
      var part = node.getAttribute('data-part');
      if (part != null && String(part) !== '') {
        return { action: 'go', part: String(part) };
      }
    }
    node = node.parentNode || node.parentElement || null;
  }
  return null;
}

/**
 * Bind delegated click on widget root (idempotent).
 * @param {Element} el
 * @param {object} deps
 */
function bindGoClicks(el, deps) {
  if (!el || el.getAttribute(GO_BOUND_ATTR) === '1') return;
  if (typeof el.addEventListener !== 'function') {
    // Minimal test DOM without events: callers use clickGo directly.
    return;
  }
  el.setAttribute(GO_BOUND_ATTR, '1');
  el.addEventListener('click', function (ev) {
    var target = ev && (ev.target || ev.srcElement);
    var hit = findGoTarget(target, el);
    if (!hit) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    clickGo(el, hit.part, deps).catch(function () {
      /* soft-fail: leave widget mounted */
    });
  });
}

/**
 * Fullscreen paging helper: load nextOffset page and append parts.
 * @param {Element} el
 * @param {object} deps
 */
async function pageFullscreen(el, deps) {
  var next = el.getAttribute('data-next-offset');
  if (next == null || next === '') return null;
  var guid = el.getAttribute('data-widget-guid');
  var host =
    (deps.location && deps.location.host) ||
    el.getAttribute('data-host') ||
    '';
  var uri =
    deps.location && deps.location.pathname != null
      ? String(deps.location.pathname)
      : undefined;
  var page = await fetchPartsPage({
    fetch: deps.fetch,
    apiBase: deps.apiBase,
    host: host,
    widgetGuid: guid,
    offset: Number(next),
    n: deps.n != null ? deps.n : DEFAULT_N,
    uri: uri,
  });
  var layout = resolveLayout(page.layout, el.getAttribute('data-mode'));
  el.setAttribute('data-mode', layout);
  var html = partsHtml(page.parts || []);
  // Append part nodes; keep existing.
  var wrap = el.ownerDocument.createElement('div');
  wrap.innerHTML = html;
  while (wrap.firstChild) {
    el.insertBefore(wrap.firstChild, el.querySelector('[data-action="page-more"]'));
  }
  if (page.nextOffset != null) {
    el.setAttribute('data-next-offset', String(page.nextOffset));
  } else {
    el.removeAttribute('data-next-offset');
    var btn = el.querySelector('[data-action="page-more"]');
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
  }
  return page;
}

/**
 * Mount a single widget element (idempotent via BOOTED_ATTR).
 * @param {Element} el
 * @param {object} deps
 */
async function mountWidget(el, deps) {
  if (!el || el.getAttribute(BOOTED_ATTR) === '1') {
    return { skipped: true };
  }
  el.setAttribute(BOOTED_ATTR, '1');
  var guid = el.getAttribute('data-widget-guid');
  if (!guid) {
    el.setAttribute('data-state', 'error');
    return { skipped: false, error: 'widget_guid_required' };
  }
  var host =
    (deps.location && deps.location.host) ||
    el.getAttribute('data-host') ||
    '';
  if (!host) {
    el.setAttribute('data-state', 'error');
    return { skipped: false, error: 'host_required' };
  }
  var uri =
    deps.location && deps.location.pathname != null
      ? String(deps.location.pathname)
      : undefined;
  var fallbackMode = el.getAttribute('data-mode');
  var apiBase =
    deps.apiBase != null
      ? String(deps.apiBase)
      : el.getAttribute('data-api-base') || '';
  var mountDeps = {
    document: deps.document,
    location: deps.location,
    fetch: deps.fetch,
    apiBase: apiBase,
    n: deps.n,
    openUrl: deps.openUrl,
  };
  bindGoClicks(el, mountDeps);
  try {
    var page = await fetchPartsPage({
      fetch: deps.fetch,
      apiBase: apiBase,
      host: host,
      widgetGuid: guid,
      offset: 0,
      n: deps.n != null ? deps.n : DEFAULT_N,
      uri: uri,
    });
    renderPage(el, page, fallbackMode);
    return { skipped: false, page: page };
  } catch (err) {
    el.setAttribute('data-state', 'error');
    el.innerHTML = '<div class="err">Unable to load deals.</div>';
    return { skipped: false, error: err && err.code ? err.code : 'mount_error' };
  }
}

/**
 * Boot all widgets on the document. Safe to call twice (no double render).
 * @param {object} [deps]
 * @returns {Promise<object[]>}
 */
async function boot(deps) {
  deps = deps || {};
  var doc = deps.document;
  if (!doc) {
    throw new Error('document_required');
  }
  var loc = deps.location || { host: '', pathname: '' };
  var fetchFn = deps.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch_required');
  }
  var nodes = doc.querySelectorAll(SELECTOR);
  var list = [];
  for (var i = 0; i < nodes.length; i++) list.push(nodes[i]);
  var results = [];
  for (var j = 0; j < list.length; j++) {
    results.push(
      await mountWidget(list[j], {
        document: doc,
        location: loc,
        fetch: fetchFn,
        apiBase: deps.apiBase,
        n: deps.n,
        openUrl: deps.openUrl,
      }),
    );
  }
  return results;
}

var api = {
  SELECTOR: SELECTOR,
  BOOTED_ATTR: BOOTED_ATTR,
  GO_BOUND_ATTR: GO_BOUND_ATTR,
  DEFAULT_N: DEFAULT_N,
  buildPartsUrl: buildPartsUrl,
  buildGoUrl: buildGoUrl,
  resolveLayout: resolveLayout,
  partsHtml: partsHtml,
  renderPage: renderPage,
  fetchPartsPage: fetchPartsPage,
  clickGo: clickGo,
  bindGoClicks: bindGoClicks,
  findGoTarget: findGoTarget,
  pageFullscreen: pageFullscreen,
  mountWidget: mountWidget,
  boot: boot,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof globalThis !== 'undefined') {
  globalThis.ASearchWidget = api;
}
