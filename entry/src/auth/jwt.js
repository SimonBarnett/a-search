'use strict';

/**
 * JWT Bearer verify for a-search entry (FR-004).
 * Returns { userId } from the JWT claim. Never trusts a request-body user id.
 *
 * Env (process.env or opts.env):
 * - JWT_ISSUER, JWT_AUDIENCE (required)
 * - JWT_SECRET or JWT_HS256_SECRET (HS256 shared secret), and/or
 * - JWT_JWKS_URL (JWKS — requires network; HS256 preferred for fixtures)
 */

const crypto = require('node:crypto');

class AuthError extends Error {
  /**
   * @param {'unauthorized'|'missing_user_id_claim'} code
   * @param {string} [message]
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'AuthError';
    this.code = code;
  }
}

function b64urlToBuf(s) {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * @param {Record<string, string|undefined>} [env]
 */
function resolveConfig(env) {
  const e = env || process.env;
  const issuer = e.JWT_ISSUER;
  const audience = e.JWT_AUDIENCE;
  const secret = e.JWT_SECRET || e.JWT_HS256_SECRET;
  const jwksUrl = e.JWT_JWKS_URL;
  if (!issuer || !audience) {
    throw new AuthError(
      'unauthorized',
      'JWT_ISSUER and JWT_AUDIENCE are required',
    );
  }
  if (!secret && !jwksUrl) {
    throw new AuthError(
      'unauthorized',
      'JWT_SECRET (or JWT_HS256_SECRET) and/or JWT_JWKS_URL required',
    );
  }
  return { issuer, audience, secret, jwksUrl };
}

/**
 * Verify HS256 JWT with shared secret.
 * @param {string} token
 * @param {{ issuer: string, audience: string, secret: string }} cfg
 */
function verifyHs256(token, cfg) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AuthError('unauthorized', 'malformed jwt');
  }
  const [h, p, s] = parts;
  const data = `${h}.${p}`;
  const expected = crypto
    .createHmac('sha256', cfg.secret)
    .update(data)
    .digest();
  let actual;
  try {
    actual = b64urlToBuf(s);
  } catch {
    throw new AuthError('unauthorized', 'malformed signature');
  }
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new AuthError('unauthorized', 'bad signature');
  }

  let header;
  let payload;
  try {
    header = JSON.parse(b64urlToBuf(h).toString('utf8'));
    payload = JSON.parse(b64urlToBuf(p).toString('utf8'));
  } catch {
    throw new AuthError('unauthorized', 'malformed jwt payload');
  }
  if (header.alg !== 'HS256') {
    throw new AuthError('unauthorized', 'unsupported alg');
  }
  if (payload.iss !== cfg.issuer) {
    throw new AuthError('unauthorized', 'issuer mismatch');
  }
  const aud = payload.aud;
  const audOk = Array.isArray(aud)
    ? aud.includes(cfg.audience)
    : aud === cfg.audience;
  if (!audOk) {
    throw new AuthError('unauthorized', 'audience mismatch');
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) {
    throw new AuthError('unauthorized', 'expired');
  }
  if (typeof payload.nbf === 'number' && now < payload.nbf) {
    throw new AuthError('unauthorized', 'not yet valid');
  }

  const userId = payload.userId;
  if (userId === undefined || userId === null || userId === '') {
    throw new AuthError('missing_user_id_claim');
  }
  if (typeof userId !== 'string' && typeof userId !== 'number') {
    throw new AuthError('missing_user_id_claim');
  }
  return { userId: String(userId) };
}

/**
 * Verify Authorization Bearer JWT → { userId }.
 * Ignores opts.body entirely (never trusts a request-body user id).
 *
 * @param {string|undefined|null} authorizationHeader
 * @param {{ env?: Record<string, string|undefined>, body?: unknown }} [opts]
 * @returns {Promise<{ userId: string }>}
 */
async function verifyAuthorization(authorizationHeader, opts = {}) {
  // Intentionally unused: body must never supply userId.
  void opts.body;

  const cfg = resolveConfig(opts.env);
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    throw new AuthError('unauthorized', 'missing authorization');
  }
  const m = /^(Bearer)\s+(\S+)\s*$/i.exec(authorizationHeader.trim());
  if (!m) {
    throw new AuthError('unauthorized', 'expected Bearer token');
  }
  const token = m[2];

  if (cfg.secret) {
    return verifyHs256(token, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      secret: cfg.secret,
    });
  }

  // JWKS path: defer to jose when available (optional dep for deploy).
  // Fixtures and local tests use JWT_SECRET / JWT_HS256_SECRET.
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const jose = require('jose');
    const JWKS = jose.createRemoteJWKSet(new URL(cfg.jwksUrl));
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: cfg.issuer,
      audience: cfg.audience,
    });
    if (payload.userId === undefined || payload.userId === null || payload.userId === '') {
      throw new AuthError('missing_user_id_claim');
    }
    return { userId: String(payload.userId) };
  } catch (err) {
    if (err instanceof AuthError) throw err;
    if (err && err.code === 'MODULE_NOT_FOUND') {
      throw new AuthError(
        'unauthorized',
        'JWT_JWKS_URL set but jose is not installed; set JWT_SECRET for HS256',
      );
    }
    throw new AuthError('unauthorized', err && err.message ? err.message : 'jwks verify failed');
  }
}

module.exports = {
  verifyAuthorization,
  AuthError,
  // test/helpers only — not for request body trust
  _timingSafeEqualStr: timingSafeEqualStr,
};
