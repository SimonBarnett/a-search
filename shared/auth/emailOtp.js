'use strict';

/**
 * FR-228: email magic link / OTP + merchant SMS OTP flows.
 */

const crypto = require('node:crypto');
const { hashSecret } = require('./otpStore');

const E164_RE = /^\+[1-9]\d{7,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/**
 * Mask E.164 for logs: +44******1234 style (keep country + last 4).
 * @param {string} phone
 */
function maskPhone(phone) {
  const s = String(phone || '');
  if (s.length < 8) return '***';
  const keepStart = Math.min(3, s.length - 4);
  return `${s.slice(0, keepStart)}${'*'.repeat(Math.max(4, s.length - keepStart - 4))}${s.slice(-4)}`;
}

/**
 * @param {string} email
 */
function normalizeEmail(email) {
  const s = String(email || '')
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(s)) {
    const err = new Error('invalid_email');
    err.code = 'invalid_email';
    throw err;
  }
  return s;
}

/**
 * UK default +44 when national number given; otherwise require E.164.
 * @param {string} phone
 */
function normalizePhone(phone) {
  let s = String(phone || '').trim().replace(/[\s()-]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (/^0\d{9,10}$/.test(s)) s = `+44${s.slice(1)}`;
  if (!s.startsWith('+')) s = `+44${s}`;
  if (!E164_RE.test(s)) {
    const err = new Error('invalid_phone');
    err.code = 'invalid_phone';
    throw err;
  }
  return s;
}

function sixDigitCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * @param {{
 *   email: string,
 *   mode?: 'otp'|'magic',
 *   store: object,
 *   mailer: { send: Function },
 *   pepper: string,
 *   nowMs?: number,
 *   magicBaseUrl?: string,
 * }} args
 */
async function requestEmailLogin(args) {
  const email = normalizeEmail(args.email);
  const mode = args.mode === 'magic' ? 'magic' : 'otp';
  const nowMs = args.nowMs != null ? args.nowMs : Date.now();
  const pepper = args.pepper;
  if (!pepper) {
    const err = new Error('otp_pepper_required');
    err.code = 'otp_pepper_required';
    throw err;
  }

  args.store.assertCanSend({ channel: 'email', destination: email, nowMs });

  let secret;
  let magicToken;
  let magicUrl;
  if (mode === 'magic') {
    magicToken = randomToken();
    secret = magicToken;
    const base = String(args.magicBaseUrl || '').replace(/\/$/, '');
    magicUrl = base
      ? `${base}?token=${encodeURIComponent(magicToken)}&email=${encodeURIComponent(email)}`
      : undefined;
  } else {
    secret = sixDigitCode();
  }

  args.store.put({
    channel: 'email',
    destination: email,
    kind: mode,
    secretHash: hashSecret(pepper, secret),
    nowMs,
  });
  args.store.recordSend({ channel: 'email', destination: email, nowMs });

  const subject =
    mode === 'magic' ? 'Your a-search magic link' : 'Your a-search login code';
  const text =
    mode === 'magic'
      ? `Open this link to sign in: ${magicUrl || magicToken}`
      : `Your login code is ${secret}. It expires in 10 minutes.`;

  await args.mailer.send({
    to: email,
    subject,
    text,
    body: text,
    code: mode === 'otp' ? secret : undefined,
    magicToken: mode === 'magic' ? magicToken : undefined,
    magicUrl,
  });

  return {
    ok: true,
    channel: 'email',
    mode,
    // Test/fixture surface only; production clients never need this.
    magicToken: mode === 'magic' ? magicToken : undefined,
  };
}

/**
 * @param {{
 *   email: string,
 *   code?: string,
 *   magicToken?: string,
 *   store: object,
 *   pepper: string,
 *   resolveIdentity: (c: { email: string }) => string | Promise<string>,
 *   mintSession: (claims: object) => string | Promise<string>,
 *   nowMs?: number,
 * }} args
 */
async function verifyEmailLogin(args) {
  const email = normalizeEmail(args.email);
  const nowMs = args.nowMs != null ? args.nowMs : Date.now();
  const secret = args.magicToken || args.code;
  if (!secret) {
    const err = new Error('otp_code_required');
    err.code = 'otp_code_required';
    throw err;
  }
  const kind = args.magicToken ? 'magic' : 'otp';
  args.store.consume({
    channel: 'email',
    destination: email,
    secret: String(secret),
    pepper: args.pepper,
    kind,
    nowMs,
  });

  const userId = await args.resolveIdentity({ email });
  const token = await args.mintSession({
    userId,
    contactVerified: true,
    contactChannel: 'email',
    email,
    amr: ['otp'],
  });
  return { ok: true, userId, token, contactVerified: true, contactChannel: 'email' };
}

/**
 * @param {{
 *   phone: string,
 *   store: object,
 *   sms: { send: Function },
 *   pepper: string,
 *   nowMs?: number,
 * }} args
 */
async function requestSmsLogin(args) {
  const phone = normalizePhone(args.phone);
  const nowMs = args.nowMs != null ? args.nowMs : Date.now();
  const pepper = args.pepper;
  if (!pepper) {
    const err = new Error('otp_pepper_required');
    err.code = 'otp_pepper_required';
    throw err;
  }

  args.store.assertCanSend({ channel: 'sms', destination: phone, nowMs });
  const code = sixDigitCode();
  args.store.put({
    channel: 'sms',
    destination: phone,
    kind: 'otp',
    secretHash: hashSecret(pepper, code),
    nowMs,
  });
  args.store.recordSend({ channel: 'sms', destination: phone, nowMs });

  await args.sms.send({
    to: phone,
    text: `Your a-search code is ${code}. Expires in 10 minutes.`,
    body: `Your a-search code is ${code}. Expires in 10 minutes.`,
    code,
  });

  return { ok: true, channel: 'sms', maskedPhone: maskPhone(phone) };
}

/**
 * @param {{
 *   phone: string,
 *   code: string,
 *   store: object,
 *   pepper: string,
 *   resolveIdentity: (c: { phone: string }) => string | Promise<string>,
 *   mintSession: (claims: object) => string | Promise<string>,
 *   nowMs?: number,
 * }} args
 */
async function verifySmsLogin(args) {
  const phone = normalizePhone(args.phone);
  const nowMs = args.nowMs != null ? args.nowMs : Date.now();
  if (!args.code) {
    const err = new Error('otp_code_required');
    err.code = 'otp_code_required';
    throw err;
  }
  args.store.consume({
    channel: 'sms',
    destination: phone,
    secret: String(args.code),
    pepper: args.pepper,
    kind: 'otp',
    nowMs,
  });

  const userId = await args.resolveIdentity({ phone });
  const token = await args.mintSession({
    userId,
    contactVerified: true,
    contactChannel: 'phone',
    phone,
    amr: ['otp'],
  });
  return {
    ok: true,
    userId,
    token,
    contactVerified: true,
    contactChannel: 'phone',
    maskedPhone: maskPhone(phone),
  };
}

module.exports = {
  maskPhone,
  normalizeEmail,
  normalizePhone,
  requestEmailLogin,
  verifyEmailLogin,
  requestSmsLogin,
  verifySmsLogin,
};
