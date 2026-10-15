'use strict';

/**
 * #1344 / #2078 content script: Club TXT gate; Shadow DOM top bar + Edit dialog.
 * JWT never written to localStorage or page DOM (session only via background).
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
  /** @type {object|null} */
  let lastStatus = null;
  /** @type {string|null} */
  let sessionRole = null;
  /** @type {boolean} */
  let loggedIn = false;

  function shouldInject(status) {
    return !!(
      status &&
      status.enabled === true &&
      status.clubId != null &&
      String(status.clubId).trim() !== ''
    );
  }

  function send(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          resolve(res || { ok: false, error: 'no_response' });
        });
      } catch (_err) {
        resolve({ ok: false, error: 'send_failed' });
      }
    });
  }

  function formatCommissionChip(commission) {
    const c = commission || {};
    const minor = Number(c.unclaimedMinor);
    const currency = String(c.currency || 'GBP').toUpperCase();
    const safe = Number.isFinite(minor) ? minor : 0;
    return currency + ' ' + (safe / 100).toFixed(2);
  }

  function removeBar() {
    if (hostEl && hostEl.parentNode) {
      hostEl.parentNode.removeChild(hostEl);
    }
    hostEl = null;
    shadow = null;
  }

  function openUrl(url) {
    if (!url) return;
    try {
      window.open(String(url), '_blank', 'noopener');
    } catch (_err) {
      /* ignore */
    }
  }

  async function copyText(text) {
    const t = String(text || '');
    if (!t) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
      }
    } catch (_err) {
      /* fall through */
    }
    return false;
  }

  function ensureDialog() {
    if (!shadow) return null;
    let dlg = shadow.querySelector('[data-role="edit-dialog"]');
    if (dlg) return dlg;
    dlg = document.createElement('div');
    dlg.setAttribute('data-role', 'edit-dialog');
    dlg.style.cssText =
      'display:none;position:fixed;inset:40px 10% auto;z-index:2147483647;' +
      'background:#1b2a2a;color:#fff;padding:12px;border-radius:8px;' +
      'font:13px system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    dlg.innerHTML =
      '<div style="font-weight:600;margin-bottom:8px">Edit widget</div>' +
      '<label>Layout <select data-field="layout">' +
      '<option value="horizontal">horizontal</option>' +
      '<option value="vertical">vertical</option>' +
      '<option value="fullscreen">fullscreen</option>' +
      '</select></label>' +
      '<div style="margin-top:8px"><label>Feedback type ' +
      '<select data-field="feedbackType"><option value="context">context</option>' +
      '<option value="remove">remove</option></select></label></div>' +
      '<div style="margin-top:8px"><label>Reason ' +
      '<select data-field="reason"><option value="other">other</option>' +
      '<option value="wrong">wrong</option></select></label></div>' +
      '<div style="margin-top:8px"><label>Other text ' +
      '<input data-field="otherText" type="text" style="width:90%"/></label></div>' +
      '<div style="margin-top:10px;display:flex;gap:8px">' +
      '<button type="button" data-edit-action="save">Save layout</button>' +
      '<button type="button" data-edit-action="feedback">Send feedback</button>' +
      '<button type="button" data-edit-action="close">Close</button>' +
      '</div>' +
      '<div data-role="edit-status" style="margin-top:8px;opacity:.85;font-size:12px"></div>';
    shadow.appendChild(dlg);
    dlg.addEventListener('click', async function (ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      const act = t.getAttribute('data-edit-action');
      if (!act) return;
      const guid = dlg.getAttribute('data-widget-guid') || '';
      const statusEl = dlg.querySelector('[data-role="edit-status"]');
      if (act === 'close') {
        dlg.style.display = 'none';
        return;
      }
      if (act === 'save') {
        const layout = dlg.querySelector('[data-field="layout"]').value;
        const res = await send({
          type: 'patchWidget',
          widgetGuid: guid,
          layout: layout,
          host: location.host,
        });
        statusEl.textContent = res.ok
          ? 'Saved'
          : 'Error ' + (res.status || '') + ' ' + ((res.result && res.result.error) || res.error || '');
        return;
      }
      if (act === 'feedback') {
        const feedbackType = dlg.querySelector('[data-field="feedbackType"]').value;
        const reason = dlg.querySelector('[data-field="reason"]').value;
        const otherText = dlg.querySelector('[data-field="otherText"]').value;
        const res = await send({
          type: 'widgetFeedback',
          widgetGuid: guid,
          feedbackType: feedbackType,
          reason: reason,
          otherText: otherText,
        });
        statusEl.textContent = res.ok
          ? 'Feedback sent'
          : 'Error ' + (res.status || '') + ' ' + ((res.result && res.result.error) || res.error || '');
      }
    });
    return dlg;
  }

  function openEditDialog(widgetGuid) {
    const dlg = ensureDialog();
    if (!dlg) return;
    dlg.setAttribute('data-widget-guid', String(widgetGuid || ''));
    dlg.style.display = 'block';
    const statusEl = dlg.querySelector('[data-role="edit-status"]');
    if (statusEl) statusEl.textContent = '';
  }

  function renderBar(status) {
    if (!shadow) return;
    const bar = shadow.querySelector('.bar');
    if (!bar) return;
    const meta =
      'club ' +
      String(status.clubId) +
      (status.partnerId ? ' / partner ' + String(status.partnerId) : '');

    if (!loggedIn) {
      bar.innerHTML =
        '<button type="button" data-action="login">Login</button>' +
        '<span class="meta" data-role="meta">' +
        meta +
        '</span>';
      return;
    }

    let html =
      '<span class="chip" data-role="commission-chip" data-action="commission">…</span>' +
      '<button type="button" data-action="stripe">Stripe</button>';
    if (String(sessionRole || '').toLowerCase() === 'club') {
      html += '<button type="button" data-action="claim">Claim</button>';
    }
    html +=
      '<button type="button" data-action="upgrade">Upgrade</button>' +
      '<button type="button" data-action="create">Create widget</button>' +
      '<button type="button" data-action="logout">Logout</button>' +
      '<span class="meta" data-role="meta">' +
      meta +
      '</span>';
    bar.innerHTML = html;

    send({ type: 'getCommission' }).then(function (res) {
      const chip = shadow && shadow.querySelector('[data-role="commission-chip"]');
      if (!chip) return;
      if (res && res.ok && res.commission) {
        chip.textContent = formatCommissionChip(res.commission);
      } else {
        chip.textContent = 'commission';
      }
    });
  }

  function ensureBar(status) {
    if (hostEl) {
      renderBar(status);
      return;
    }
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
      'button,.chip{cursor:pointer;border:1px solid #89a;background:#234;color:#fff;' +
      'padding:2px 8px;border-radius:4px}' +
      '.chip{display:inline-block}' +
      '.meta{opacity:.8;font-size:12px;margin-left:auto}';
    shadow.appendChild(style);
    const bar = document.createElement('div');
    bar.className = 'bar';
    shadow.appendChild(bar);
    document.documentElement.appendChild(hostEl);

    bar.addEventListener('click', async function (ev) {
      const t = ev.target;
      if (!t || !t.getAttribute) return;
      const action = t.getAttribute('data-action');
      if (!action) return;
      if (action === 'login') {
        const res = await send({ type: 'login', intent: 'club' });
        if (res && res.ok) {
          loggedIn = true;
          sessionRole = res.role || null;
          renderBar(lastStatus || status);
        }
        return;
      }
      if (action === 'logout') {
        await send({ type: 'logout' });
        loggedIn = false;
        sessionRole = null;
        renderBar(lastStatus || status);
        return;
      }
      if (action === 'stripe') {
        const res = await send({ type: 'stripeLink' });
        const url = res && res.result && (res.result.setupUrl || res.result.url);
        openUrl(url);
        return;
      }
      if (action === 'claim') {
        await send({ type: 'claim' });
        renderBar(lastStatus || status);
        return;
      }
      if (action === 'upgrade') {
        const res = await send({ type: 'upgrade', host: location.host });
        const url = res && res.result && res.result.url;
        openUrl(url);
        return;
      }
      if (action === 'create') {
        const res = await send({
          type: 'createWidget',
          layout: 'horizontal',
          host: location.host,
        });
        const snippet = res && res.result && res.result.snippet;
        if (snippet) {
          const ok = await copyText(snippet);
          const chip = shadow.querySelector('[data-role="commission-chip"]');
          if (chip && ok) chip.title = 'widget snippet copied';
        }
        return;
      }
      if (action === 'commission') {
        renderBar(lastStatus || status);
      }
    });

    renderBar(status);
  }

  function attachEditControls() {
    if (!shadow || !loggedIn) return;
    const widgets = document.querySelectorAll(
      '.a-search-widget[data-widget-guid]',
    );
    widgets.forEach(function (el) {
      if (el.getAttribute('data-a-search-edit') === '1') return;
      el.setAttribute('data-a-search-edit', '1');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Edit';
      btn.setAttribute(
        'data-a-search-edit-btn',
        el.getAttribute('data-widget-guid') || '',
      );
      btn.style.cssText =
        'position:absolute;z-index:2147483645;font:12px system-ui;margin:4px';
      el.style.position = el.style.position || 'relative';
      el.appendChild(btn);
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openEditDialog(el.getAttribute('data-widget-guid') || '');
      });
    });
  }

  async function syncSession() {
    const res = await send({ type: 'getJwt' });
    loggedIn = !!(res && res.ok && res.jwt);
    sessionRole = (res && res.role) || null;
  }

  async function refresh() {
    const host = String(location.host || '');
    if (host === lastHost && hostEl) {
      await syncSession();
      if (lastStatus) renderBar(lastStatus);
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
    lastStatus = status;
    if (!shouldInject(status)) {
      removeBar();
      return;
    }
    await syncSession();
    ensureBar(status);
    attachEditControls();
  }

  refresh();
  const _push = history.pushState;
  history.pushState = function () {
    _push.apply(this, arguments);
    refresh();
  };
  window.addEventListener('popstate', refresh);
})();
