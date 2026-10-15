'use strict';

/**
 * FR-228: in-memory OTP / magic-token store (tests + single-instance Lambda).
 * Production can swap for a_search.dbo.OtpCodes via the same interface.
 */

const crypto = require('node:crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;
const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 3;
const MAX_SENDS_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {string} pepper
 * @param {string} code
 */
function hashSecret(pepper, code) {
  return crypto
    .createHash('sha256')
    .update(`${pepper}:${code}`, 'utf8')
    .digest('hex');
}

function createOtpStore() {
  /** @type {Map<string, object>} */
  const rows = new Map();
  /** @type {Map<string, number[]>} */
  const sendTimes = new Map();

  function keyOf(channel, destination) {
    return `${channel}:${String(destination).trim().toLowerCase()}`;
  }

  return {
    hashSecret,

    /**
     * @param {{
     *   channel: 'email'|'sms',
     *   destination: string,
     *   kind: 'otp'|'magic',
     *   secretHash: string,
     *   nowMs: number,
     *   ttlMs?: number,
     *   maxAttempts?: number,
     * }} args
     */
    put(args) {
      const key = keyOf(args.channel, args.destination);
      const nowMs = args.nowMs;
      const ttlMs = args.ttlMs != null ? args.ttlMs : DEFAULT_TTL_MS;
      rows.set(key, {
        channel: args.channel,
        destination: args.destination,
        kind: args.kind,
        secretHash: args.secretHash,
        expiresAt: nowMs + ttlMs,
        attempts: 0,
        maxAttempts:
          args.maxAttempts != null ? args.maxAttempts : DEFAULT_MAX_ATTEMPTS,
        used: false,
      });
    },

    /**
     * Record a send and enforce rate limits.
     * @param {{ channel: string, destination: string, nowMs: number }} args
     */
    assertCanSend(args) {
      const key = keyOf(args.channel, args.destination);
      const nowMs = args.nowMs;
      const times = (sendTimes.get(key) || []).filter((t) => nowMs - t < DAY_MS);
      sendTimes.set(key, times);

      if (times.length > 0) {
        const last = times[times.length - 1];
        if (nowMs - last < RESEND_COOLDOWN_MS) {
          const err = new Error('otp_resend_cooldown');
          err.code = 'otp_resend_cooldown';
          throw err;
        }
      }
      const inWindow = times.filter((t) => nowMs - t < SEND_WINDOW_MS);
      if (inWindow.length >= MAX_SENDS_PER_WINDOW) {
        const err = new Error('otp_rate_limited');
        err.code = 'otp_rate_limited';
        throw err;
      }
      if (times.length >= MAX_SENDS_PER_DAY) {
        const err = new Error('otp_rate_limited');
        err.code = 'otp_rate_limited';
        throw err;
      }
    },

    /**
     * @param {{ channel: string, destination: string, nowMs: number }} args
     */
    recordSend(args) {
      const key = keyOf(args.channel, args.destination);
      const times = sendTimes.get(key) || [];
      times.push(args.nowMs);
      sendTimes.set(key, times);
    },

    /**
     * @param {{
     *   channel: string,
     *   destination: string,
     *   secret: string,
     *   pepper: string,
     *   kind?: string,
     *   nowMs: number,
     * }} args
     */
    consume(args) {
      const key = keyOf(args.channel, args.destination);
      const row = rows.get(key);
      if (!row || row.used) {
        const err = new Error('otp_invalid');
        err.code = 'otp_invalid';
        throw err;
      }
      if (args.kind && row.kind !== args.kind) {
        const err = new Error('otp_invalid');
        err.code = 'otp_invalid';
        throw err;
      }
      if (args.nowMs >= row.expiresAt) {
        rows.delete(key);
        const err = new Error('otp_expired');
        err.code = 'otp_expired';
        throw err;
      }
      if (row.attempts >= row.maxAttempts) {
        const err = new Error('otp_attempts_exhausted');
        err.code = 'otp_attempts_exhausted';
        throw err;
      }
      const got = hashSecret(args.pepper, args.secret);
      if (got !== row.secretHash) {
        row.attempts += 1;
        if (row.attempts >= row.maxAttempts) {
          const err = new Error('otp_attempts_exhausted');
          err.code = 'otp_attempts_exhausted';
          throw err;
        }
        const err = new Error('otp_invalid');
        err.code = 'otp_invalid';
        throw err;
      }
      row.used = true;
      rows.delete(key);
      return { channel: row.channel, destination: row.destination, kind: row.kind };
    },

    clear() {
      rows.clear();
      sendTimes.clear();
    },
  };
}

module.exports = {
  createOtpStore,
  hashSecret,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  MAX_SENDS_PER_WINDOW,
  MAX_SENDS_PER_DAY,
};
