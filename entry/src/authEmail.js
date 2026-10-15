'use strict';

/**
 * FR-228 HTTP: email magic/OTP + merchant SMS request/verify.
 */

const { createOtpStore } = require('../../shared/auth/otpStore');
const { createMailSender } = require('../../shared/notify/mailSender');
const { createSmsSender } = require('../../shared/notify/smsSender');
const {
  requestEmailLogin,
  verifyEmailLogin,
  requestSmsLogin,
  verifySmsLogin,
} = require('../../shared/auth/emailOtp');
const { mintSessionToken } = require('../../shared/auth/sessionToken');
const { assertUserId } = require('../../shared/identity/userId');
const crypto = require('node:crypto');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

const defaultStore = createOtpStore();
const defaultMailer = createMailSender();
const defaultSms = createSmsSender();

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

function resolvePath(event) {
  let path = String(
    (event && event.rawPath) ||
      (event &&
        event.requestContext &&
        event.requestContext.http &&
        event.requestContext.http.path) ||
      (event && event.path) ||
      '',
  );
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  const q = path.indexOf('?');
  if (q >= 0) path = path.slice(0, q);
  return path;
}

function resolveMethod(event) {
  return String(
    (event &&
      event.requestContext &&
      event.requestContext.http &&
      event.requestContext.http.method) ||
      (event && event.httpMethod) ||
      'POST',
  ).toUpperCase();
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchAuthEmailRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m !== 'POST') return null;
  if (p === '/auth/email/request') return 'POST /auth/email/request';
  if (p === '/auth/email/verify') return 'POST /auth/email/verify';
  if (p === '/auth/sms/request') return 'POST /auth/sms/request';
  if (p === '/auth/sms/verify') return 'POST /auth/sms/verify';
  return null;
}

/**
 * Deterministic fixture identity from contact (tests / until FR-251 Merchants wire).
 * @param {{ email?: string, phone?: string }} contact
 */
function defaultResolveIdentity(contact) {
  const seed = String(contact.email || contact.phone || 'x');
  const hex = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[parseInt(hex.slice(i * 2, i * 2 + 2), 16) % 36];
  }
  return assertUserId(out);
}

function mapOtpError(err) {
  const code = (err && err.code) || 'otp_failed';
  if (
    code === 'invalid_email' ||
    code === 'invalid_phone' ||
    code === 'otp_code_required' ||
    code === 'mail_to_required' ||
    code === 'sms_to_required'
  ) {
    return jsonResponse(400, { ok: false, error: code });
  }
  if (
    code === 'otp_resend_cooldown' ||
    code === 'otp_rate_limited' ||
    code === 'otp_attempts_exhausted'
  ) {
    return jsonResponse(429, { ok: false, error: code });
  }
  if (
    code === 'otp_invalid' ||
    code === 'otp_expired' ||
    code === 'otp_pepper_required' ||
    code === 'jwt_env_required'
  ) {
    return jsonResponse(401, { ok: false, error: code === 'otp_pepper_required' || code === 'jwt_env_required' ? code : 'otp_invalid' });
  }
  if (code === 'mail_sender_unconfigured' || code === 'sms_sender_unconfigured') {
    return jsonResponse(503, { ok: false, error: code });
  }
  throw err;
}

function pepperFromEnv(env) {
  return env.OTP_PEPPER || env.JWT_SECRET || env.JWT_HS256_SECRET || '';
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAuthEmailRequest(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) return jsonResponse(400, { ok: false, error: 'invalid_json' });
  const env = deps.env || process.env;
  try {
    const result = await requestEmailLogin({
      email: parsed.email,
      mode: parsed.mode,
      store: deps.store || defaultStore,
      mailer: deps.mailer || defaultMailer,
      pepper: pepperFromEnv(env),
      nowMs: deps.nowMs,
      magicBaseUrl: deps.magicBaseUrl || env.AUTH_MAGIC_BASE_URL,
    });
    return jsonResponse(200, { ok: true, channel: result.channel, mode: result.mode });
  } catch (err) {
    return mapOtpError(err);
  }
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAuthEmailVerify(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) return jsonResponse(400, { ok: false, error: 'invalid_json' });
  const env = deps.env || process.env;
  const resolveIdentity = deps.resolveIdentity || defaultResolveIdentity;
  try {
    const result = await verifyEmailLogin({
      email: parsed.email,
      code: parsed.code,
      magicToken: parsed.magicToken || parsed.token,
      store: deps.store || defaultStore,
      pepper: pepperFromEnv(env),
      resolveIdentity,
      mintSession: (claims) =>
        mintSessionToken(claims, { env, nowMs: deps.nowMs }),
      nowMs: deps.nowMs,
    });
    return jsonResponse(200, {
      ok: true,
      token: result.token,
      userId: result.userId,
      contactVerified: true,
      contactChannel: 'email',
    });
  } catch (err) {
    return mapOtpError(err);
  }
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAuthSmsRequest(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) return jsonResponse(400, { ok: false, error: 'invalid_json' });
  const env = deps.env || process.env;
  try {
    const result = await requestSmsLogin({
      phone: parsed.phone,
      store: deps.store || defaultStore,
      sms: deps.sms || defaultSms,
      pepper: pepperFromEnv(env),
      nowMs: deps.nowMs,
    });
    return jsonResponse(200, {
      ok: true,
      channel: 'sms',
      maskedPhone: result.maskedPhone,
    });
  } catch (err) {
    return mapOtpError(err);
  }
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleAuthSmsVerify(event, deps = {}) {
  const parsed = parseBody(event && event.body);
  if (parsed === null) return jsonResponse(400, { ok: false, error: 'invalid_json' });
  const env = deps.env || process.env;
  const resolveIdentity = deps.resolveIdentity || defaultResolveIdentity;
  try {
    const result = await verifySmsLogin({
      phone: parsed.phone,
      code: parsed.code,
      store: deps.store || defaultStore,
      pepper: pepperFromEnv(env),
      resolveIdentity,
      mintSession: (claims) =>
        mintSessionToken(claims, { env, nowMs: deps.nowMs }),
      nowMs: deps.nowMs,
    });
    return jsonResponse(200, {
      ok: true,
      token: result.token,
      userId: result.userId,
      contactVerified: true,
      contactChannel: 'phone',
      maskedPhone: result.maskedPhone,
    });
  } catch (err) {
    return mapOtpError(err);
  }
}

module.exports = {
  matchAuthEmailRoute,
  handleAuthEmailRequest,
  handleAuthEmailVerify,
  handleAuthSmsRequest,
  handleAuthSmsVerify,
  resolvePath,
  resolveMethod,
};
