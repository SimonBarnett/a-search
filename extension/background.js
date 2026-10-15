'use strict';

/**
 * #1344 / #2078 service worker: JWT in chrome.storage.session only.
 * Live chrome.identity.launchWebAuthFlow against shared login (FR-229).
 * Proxies /account/* and /widgets APIs with Bearer JWT. No remote code. No LLM.
 */

const SESSION_JWT_KEY = 'aSearchJwt';
const API_BASE_DEFAULT = 'https://api.smartcatalogue.uk';
const LOGIN_ORIGIN_DEFAULT = 'https://www.smartcatalogue.uk';

function apiBase() {
  return (
    (typeof globalThis !== 'undefined' && globalThis.A_SEARCH_API_BASE) ||
    API_BASE_DEFAULT
  );
}

function loginOrigin() {
  return (
    (typeof globalThis !== 'undefined' && globalThis.A_SEARCH_LOGIN_ORIGIN) ||
    LOGIN_ORIGIN_DEFAULT
  );
}

function b64urlToJson(part) {
  try {
    const pad = part.length % 4 === 0 ? '' : '='.repeat(4 - (part.length % 4));
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return JSON.parse(atob(b64));
  } catch {
    return null;
  }
}

function decodeJwtPayload(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length < 2) return null;
  return b64urlToJson(parts[1]);
}

function parseJwtFromRedirectUrl(responseUrl) {
  const raw = String(responseUrl || '');
  if (!raw) return null;
  let hash = '';
  let search = '';
  try {
    const u = new URL(raw);
    hash = u.hash ? u.hash.replace(/^#/, '') : '';
    search = u.search ? u.search.replace(/^\?/, '') : '';
  } catch {
    const hashIdx = raw.indexOf('#');
    const qIdx = raw.indexOf('?');
    if (hashIdx >= 0) hash = raw.slice(hashIdx + 1);
    if (qIdx >= 0) {
      const end = hashIdx >= 0 && hashIdx > qIdx ? hashIdx : raw.length;
      search = raw.slice(qIdx + 1, end);
    }
  }
  const params = new URLSearchParams(hash || search);
  const token =
    params.get('access_token') ||
    params.get('id_token') ||
    params.get('jwt') ||
    params.get('token');
  if (!token || !String(token).includes('.')) return null;
  return String(token);
}

function buildExtensionLoginUrl(redirectUri, intent) {
  const origin = loginOrigin().replace(/\/$/, '');
  const u = new URL('/components-piece/login/', origin + '/');
  u.searchParams.set('extension', '1');
  u.searchParams.set('intent', intent || 'club');
  u.searchParams.set('redirect_uri', redirectUri);
  return u.toString();
}

async function getJwt() {
  const data = await chrome.storage.session.get([SESSION_JWT_KEY]);
  return data[SESSION_JWT_KEY] || null;
}

async function setJwt(jwt) {
  const payload = {};
  payload[SESSION_JWT_KEY] = jwt == null ? null : String(jwt);
  await chrome.storage.session.set(payload);
}

async function clearJwt() {
  await chrome.storage.session.remove(SESSION_JWT_KEY);
}

async function apiFetch(path, options) {
  const jwt = await getJwt();
  if (!jwt) {
    const err = new Error('not_logged_in');
    err.code = 'not_logged_in';
    throw err;
  }
  const opts = options || {};
  const headers = Object.assign(
    { accept: 'application/json', authorization: 'Bearer ' + jwt },
    opts.headers || {},
  );
  if (opts.body != null && !headers['content-type']) {
    headers['content-type'] = 'application/json; charset=utf-8';
  }
  const res = await fetch(apiBase() + path, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body != null ? opts.body : undefined,
    credentials: 'omit',
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, body: json };
}

function launchWebAuthFlowAsync(url) {
  return new Promise((resolve, reject) => {
    if (!chrome.identity || typeof chrome.identity.launchWebAuthFlow !== 'function') {
      reject(Object.assign(new Error('identity_unavailable'), { code: 'identity_unavailable' }));
      return;
    }
    chrome.identity.launchWebAuthFlow({ url: url, interactive: true }, (responseUrl) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(Object.assign(new Error(err.message || 'auth_failed'), { code: 'auth_failed' }));
        return;
      }
      resolve(responseUrl || '');
    });
  });
}

async function loginInteractive(msg) {
  if (msg && msg.fixtureJwt) {
    await setJwt(String(msg.fixtureJwt));
    const payload = decodeJwtPayload(String(msg.fixtureJwt));
    return { ok: true, jwt: true, role: payload && (payload.role || payload.intent) || null };
  }
  const redirectUri = chrome.identity.getRedirectURL();
  const url = buildExtensionLoginUrl(redirectUri, (msg && msg.intent) || 'club');
  const responseUrl = await launchWebAuthFlowAsync(url);
  const jwt = parseJwtFromRedirectUrl(responseUrl);
  if (!jwt) {
    return { ok: false, error: 'missing_token' };
  }
  await setJwt(jwt);
  const payload = decodeJwtPayload(jwt);
  return {
    ok: true,
    jwt: true,
    role: (payload && (payload.role || payload.intent)) || null,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') {
    sendResponse({ ok: false, error: 'bad_message' });
    return false;
  }

  const reply = (p) => {
    Promise.resolve(p)
      .then((r) => sendResponse(r))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: (err && err.code) || (err && err.message) || 'error',
        }),
      );
    return true;
  };

  if (msg.type === 'getJwt') {
    return reply(
      getJwt().then((jwt) => ({
        ok: true,
        jwt: jwt,
        role: (() => {
          const p = decodeJwtPayload(jwt);
          return (p && (p.role || p.intent)) || null;
        })(),
      })),
    );
  }
  if (msg.type === 'setJwt') {
    return reply(setJwt(msg.jwt).then(() => ({ ok: true })));
  }
  if (msg.type === 'clearJwt' || msg.type === 'logout') {
    return reply(clearJwt().then(() => ({ ok: true })));
  }
  if (msg.type === 'login') {
    return reply(loginInteractive(msg));
  }
  if (msg.type === 'getCommission') {
    return reply(
      apiFetch('/account/commission').then((r) => ({
        ok: r.ok,
        status: r.status,
        commission: r.body,
      })),
    );
  }
  if (msg.type === 'stripeLink') {
    return reply(
      apiFetch('/account/stripe/link', {
        method: 'POST',
        body: JSON.stringify({ setup: true }),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }
  if (msg.type === 'claim') {
    // Club-only UI; FR-222 payouts claim path.
    return reply(
      apiFetch('/account/payouts', {
        method: 'POST',
        body: JSON.stringify({}),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }
  if (msg.type === 'upgrade') {
    return reply(
      apiFetch('/account/upgrade', {
        method: 'POST',
        body: JSON.stringify({ host: msg.host || '' }),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }
  if (msg.type === 'createWidget') {
    return reply(
      apiFetch('/widgets', {
        method: 'POST',
        body: JSON.stringify({
          layout: msg.layout || 'horizontal',
          createdVia: 'extension',
          host: msg.host || undefined,
        }),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }
  if (msg.type === 'patchWidget') {
    const guid = encodeURIComponent(String(msg.widgetGuid || ''));
    return reply(
      apiFetch('/widgets/' + guid, {
        method: 'PATCH',
        body: JSON.stringify({
          layout: msg.layout,
          host: msg.host || undefined,
        }),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }
  if (msg.type === 'widgetFeedback') {
    const guid = encodeURIComponent(String(msg.widgetGuid || ''));
    return reply(
      apiFetch('/widgets/' + guid + '/feedback', {
        method: 'POST',
        body: JSON.stringify({
          type: msg.feedbackType || 'context',
          reason: msg.reason || 'other',
          otherText: msg.otherText,
          partNumber: msg.partNumber,
          context: msg.context,
        }),
      }).then((r) => ({ ok: r.ok, status: r.status, result: r.body })),
    );
  }

  sendResponse({ ok: false, error: 'unknown_type' });
  return false;
});
