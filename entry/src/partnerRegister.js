'use strict';

/**
 * FR-218: POST /partner/register -- mint partner DNS code + instructions.
 */

const {
  mintPartnerCode,
  buildPartnerRegisterResponse,
} = require('../../shared/partners/register');
const { UserIdError } = require('../../shared/identity/userId');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function parseBody(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @returns {string|null}
 */
function matchPartnerRegisterRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/partner/register') return 'POST /partner/register';
  return null;
}

/**
 * Public partner registration (no JWT). Stripe Connect out of scope.
 * @param {object} event
 * @param {object} [deps]
 */
async function handlePartnerRegister(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  const email =
    typeof parsed.email === 'string' && parsed.email.trim()
      ? parsed.email.trim()
      : undefined;

  try {
    const partnerCode = await mintPartnerCode({
      mint: deps.mint,
      isTaken: deps.isTaken,
      maxAttempts: deps.maxAttempts,
    });
    const body = buildPartnerRegisterResponse({ partnerCode, email });
    return jsonResponse(200, body);
  } catch (err) {
    if (err instanceof UserIdError) {
      return jsonResponse(500, { ok: false, error: 'mint_invalid' });
    }
    const code = (err && err.code) || 'register_failed';
    if (code === 'mint_exhausted') {
      return jsonResponse(503, { ok: false, error: code });
    }
    throw err;
  }
}

module.exports = {
  matchPartnerRegisterRoute,
  handlePartnerRegister,
};
