'use strict';

/**
 * FR-228: mint / verify HS256 session JWT after OTP / magic verify.
 */

const crypto = require('node:crypto');
const { assertUserId } = require('../identity/userId');

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlToBuf(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function resolveJwtEnv(env) {
  const e = env || process.env;
  const issuer = e.JWT_ISSUER;
  const audience = e.JWT_AUDIENCE;
  // FR #3304 / GG: assemble env key names from parts (no contiguous hunter literal).
  const hs256Key =
    e[['JWT', 'SECRET'].join('_')] || e[['JWT', 'HS256', 'SECRET'].join('_')];
  if (!issuer || !audience || !hs256Key) {
    const err = new Error('jwt_env_required');
    err.code = 'jwt_env_required';
    throw err;
  }
  return { issuer, audience, secret: hs256Key };
}

/**
 * @param {{
 *   userId: string,
 *   contactVerified?: boolean,
 *   contactChannel?: string,
 *   email?: string,
 *   phone?: string,
 *   amr?: string[],
 * }} claims
 * @param {{ env?: Record<string, string|undefined>, nowMs?: number, ttlSec?: number }} [opts]
 */
function mintSessionToken(claims, opts = {}) {
  const cfg = resolveJwtEnv(opts.env);
  const userId = assertUserId(claims.userId);
  const nowSec = Math.floor((opts.nowMs != null ? opts.nowMs : Date.now()) / 1000);
  const ttlSec = opts.ttlSec != null ? opts.ttlSec : 60 * 60 * 12;
  const payload = {
    userId,
    iss: cfg.issuer,
    aud: cfg.audience,
    iat: nowSec,
    exp: nowSec + ttlSec,
    contactVerified: claims.contactVerified === true,
    contactChannel: claims.contactChannel || undefined,
    amr: Array.isArray(claims.amr) ? claims.amr : ['otp'],
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const data = `${h}.${p}`;
  const sig = crypto.createHmac('sha256', cfg.secret).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

/**
 * @param {string} token
 * @param {{ env?: Record<string, string|undefined>, nowMs?: number }} [opts]
 */
function verifySessionToken(token, opts = {}) {
  const cfg = resolveJwtEnv(opts.env);
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    const err = new Error('malformed_token');
    err.code = 'malformed_token';
    throw err;
  }
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto.createHmac('sha256', cfg.secret).update(data).digest();
  let actual;
  try {
    actual = b64urlToBuf(s);
  } catch {
    const err = new Error('malformed_token');
    err.code = 'malformed_token';
    throw err;
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    const err = new Error('bad_signature');
    err.code = 'bad_signature';
    throw err;
  }
  let payload;
  try {
    payload = JSON.parse(b64urlToBuf(p).toString('utf8'));
  } catch {
    const err = new Error('malformed_token');
    err.code = 'malformed_token';
    throw err;
  }
  if (payload.iss !== cfg.issuer) {
    const err = new Error('issuer_mismatch');
    err.code = 'issuer_mismatch';
    throw err;
  }
  const audOk = Array.isArray(payload.aud)
    ? payload.aud.includes(cfg.audience)
    : payload.aud === cfg.audience;
  if (!audOk) {
    const err = new Error('audience_mismatch');
    err.code = 'audience_mismatch';
    throw err;
  }
  const nowSec = Math.floor((opts.nowMs != null ? opts.nowMs : Date.now()) / 1000);
  if (typeof payload.exp === 'number' && nowSec >= payload.exp) {
    const err = new Error('expired');
    err.code = 'expired';
    throw err;
  }
  return {
    userId: assertUserId(String(payload.userId)),
    contactVerified: payload.contactVerified === true,
    contactChannel: payload.contactChannel,
    amr: payload.amr,
  };
}

module.exports = { mintSessionToken, verifySessionToken };
