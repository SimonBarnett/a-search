'use strict';

/**
 * #1344 service worker: JWT in chrome.storage.session only (never localStorage).
 * No remote code. No LLM calls.
 */

const SESSION_JWT_KEY = 'aSearchJwt';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') {
    sendResponse({ ok: false, error: 'bad_message' });
    return false;
  }
  if (msg.type === 'getJwt') {
    chrome.storage.session.get([SESSION_JWT_KEY]).then((data) => {
      sendResponse({ ok: true, jwt: data[SESSION_JWT_KEY] || null });
    });
    return true;
  }
  if (msg.type === 'setJwt') {
    const jwt = msg.jwt == null ? null : String(msg.jwt);
    const payload = {};
    payload[SESSION_JWT_KEY] = jwt;
    chrome.storage.session.set(payload).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  if (msg.type === 'clearJwt') {
    chrome.storage.session.remove(SESSION_JWT_KEY).then(() => {
      sendResponse({ ok: true });
    });
    return true;
  }
  sendResponse({ ok: false, error: 'unknown_type' });
  return false;
});
