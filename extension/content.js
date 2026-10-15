'use strict';

/**
 * #1344 content script: inert until GET /ext/status says Club TXT enabled.
 * Shadow DOM top bar; JWT never written to localStorage or page DOM.
 */

(function () {
  const API_BASE =
    (typeof globalThis !== 'undefined' && globalThis.A_SEARCH_API_BASE) ||
    'https://api.smartcatalogue.uk';

  /** @type {string|null} */
  let lastHost = null;
  /** @type {ShadowRoot|null} */
  let shadow = null;
  /** @type {HTMLElement|null} */
  let hostEl = null;

  function shouldInject(status) {
    return !!(
      status &&
      status.enabled === true &&
      status.clubId != null &&
      String(status.clubId).trim() !== ''
    );
  }

  function removeBar() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
  }

  function ensureBar(status) {
    if (hostEl) return;
    hostEl = document.createElement('div');
    hostEl.id = 'a-search-ext-root';
    hostEl.setAttribute('data-a-search-ext', '1');
    shadow = hostEl.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent =
      ':host{all:initial}' +
      '.bar{position:fixed;top:0;left:0;right:0;height:36px;z-index:2147483646;' +
      'display:flex;align-items:center;gap:8px;padding:0 10px;' +
      'background:#122;color:#fff;font:13px system-ui,sans-serif}' +
      'button{cursor:pointer;border:1px solid #89a;background:#234;color:#fff;padding:2px 8px;border-radius:4px}' +
      '.meta{opacity:.8;font-size:12px;margin-left:auto}';
    shadow.appendChild(style);
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML =
      '<button type="button" data-action="login">Login</button>' +
      '<span class="meta" data-role="meta">club ' +
      String(status.clubId) +
      (status.partnerId ? ' / partner ' + String(status.partnerId) : '') +
      '</span>';
    shadow.appendChild(bar);
    document.documentElement.appendChild(hostEl);

    bar.addEventListener('click', function (ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      if (t.getAttribute('data-action') === 'login') {
        // Login uses shared stack via background chrome.identity (FR-229).
        chrome.runtime.sendMessage({ type: 'getJwt' }, function () {});
      }
    });
  }

  function attachEditControls() {
    if (!shadow) return;
    const widgets = document.querySelectorAll(
      '.a-search-widget[data-widget-guid]',
    );
    widgets.forEach(function (el) {
      if (el.getAttribute('data-a-search-edit') === '1') return;
      el.setAttribute('data-a-search-edit', '1');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Edit';
      btn.setAttribute('data-a-search-edit-btn', el.getAttribute('data-widget-guid') || '');
      btn.style.cssText =
        'position:absolute;z-index:2147483645;font:12px system-ui;margin:4px';
      el.style.position = el.style.position || 'relative';
      el.appendChild(btn);
    });
  }

  async function refresh() {
    const host = String(location.host || '');
    if (host === lastHost && hostEl) {
      attachEditControls();
      return;
    }
    lastHost = host;
    let status;
    try {
      const res = await fetch(
        API_BASE + '/ext/status?host=' + encodeURIComponent(host),
        { credentials: 'omit' },
      );
      status = await res.json();
    } catch (_err) {
      removeBar();
      return;
    }
    if (!shouldInject(status)) {
      removeBar();
      return;
    }
    ensureBar(status);
    attachEditControls();
  }

  refresh();
  // SPA: re-check only when host changes
  const _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    refresh();
  };
  window.addEventListener('popstate', refresh);
})();
