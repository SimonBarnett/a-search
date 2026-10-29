'use strict';

/**
 * FR #3655: otpStore interface backed by a_search.dbo.OtpCodes.
 * Writers stay on a_search / a_search_sandbox. Merchants identity stays on FR-251.
 */

const {
  hashSecret,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  MAX_SENDS_PER_WINDOW,
  MAX_SENDS_PER_DAY,
} = require('./otpStore');

const SEND_WINDOW_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function rowsOf(result) {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.recordset)) return result.recordset;
  return [];
}

function fail(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function col(row, name) {
  if (!row) return undefined;
  if (row[name] != null) return row[name];
  const lower = name.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lower) return row[key];
  }
  return undefined;
}

function createAsearchOtpStore(opts) {
  const query = opts && opts.query;
  if (typeof query !== 'function') {
    throw fail('otp_query_required');
  }

  function dest(args) {
    return {
      channel: args.channel,
      destination: String(args.destination).trim().toLowerCase(),
    };
  }

  return {
    hashSecret,

    async assertCanSend(args) {
      const { channel, destination } = dest(args);
      const nowMs = args.nowMs;
      const result = await query(
        'SELECT CreatedAt FROM dbo.OtpCodes WHERE Channel = @channel AND Destination = @destination',
        { channel, destination },
      );
      const times = rowsOf(result)
        .map((row) => Date.parse(col(row, 'CreatedAt')))
        .filter((t) => Number.isFinite(t) && nowMs - t < DAY_MS)
        .sort((a, b) => a - b);
      if (times.length > 0 && nowMs - times[times.length - 1] < RESEND_COOLDOWN_MS) {
        throw fail('otp_resend_cooldown');
      }
      const inWindow = times.filter((t) => nowMs - t < SEND_WINDOW_MS);
      if (inWindow.length >= MAX_SENDS_PER_WINDOW || times.length >= MAX_SENDS_PER_DAY) {
        throw fail('otp_rate_limited');
      }
    },

    async put(args) {
      const { channel, destination } = dest(args);
      const nowMs = args.nowMs;
      const ttlMs = args.ttlMs != null ? args.ttlMs : DEFAULT_TTL_MS;
      const maxAttempts = args.maxAttempts != null ? args.maxAttempts : DEFAULT_MAX_ATTEMPTS;
      const createdAt = iso(nowMs);
      const expiresAt = iso(nowMs + ttlMs);
      await query(
        'UPDATE dbo.OtpCodes SET UsedAt = @createdAt WHERE Channel = @channel AND Destination = @destination AND UsedAt IS NULL',
        { channel, destination, createdAt },
      );
      await query(
        'INSERT INTO dbo.OtpCodes (Channel, Destination, Kind, SecretHash, ExpiresAt, Attempts, MaxAttempts, CreatedAt) VALUES (@channel, @destination, @kind, @secretHash, @expiresAt, 0, @maxAttempts, @createdAt)',
        {
          channel,
          destination,
          kind: args.kind,
          secretHash: args.secretHash,
          expiresAt,
          maxAttempts,
          createdAt,
        },
      );
    },

    async recordSend() {
      return undefined;
    },

    async consume(args) {
      const { channel, destination } = dest(args);
      const result = await query(
        'SELECT TOP 1 OtpId, Kind, SecretHash, ExpiresAt, Attempts, MaxAttempts FROM dbo.OtpCodes WHERE Channel = @channel AND Destination = @destination AND UsedAt IS NULL ORDER BY CreatedAt DESC',
        { channel, destination },
      );
      const row = rowsOf(result)[0];
      if (!row) throw fail('otp_invalid');
      const kind = col(row, 'Kind');
      const secretHash = col(row, 'SecretHash');
      const expiresAt = Date.parse(col(row, 'ExpiresAt'));
      const attempts = Number(col(row, 'Attempts') || 0);
      const maxAttempts = Number(col(row, 'MaxAttempts') || DEFAULT_MAX_ATTEMPTS);
      const otpId = col(row, 'OtpId');
      if (args.kind && kind !== args.kind) throw fail('otp_invalid');
      if (!(args.nowMs < expiresAt)) {
        await query(
          'UPDATE dbo.OtpCodes SET UsedAt = @usedAt WHERE OtpId = @otpId',
          { otpId, usedAt: iso(args.nowMs) },
        );
        throw fail('otp_expired');
      }
      const got = hashSecret(args.pepper, args.secret);
      if (got !== secretHash) {
        const next = attempts + 1;
        await query(
          'UPDATE dbo.OtpCodes SET Attempts = @attempts WHERE OtpId = @otpId',
          { otpId, attempts: next },
        );
        if (next >= maxAttempts) throw fail('otp_attempts_exhausted');
        throw fail('otp_invalid');
      }
      await query(
        'UPDATE dbo.OtpCodes SET UsedAt = @usedAt WHERE OtpId = @otpId',
        { otpId, usedAt: iso(args.nowMs) },
      );
      return { channel, destination, kind };
    },

    async clear() {
      await query('DELETE FROM dbo.OtpCodes', {});
    },
  };
}

module.exports = { createAsearchOtpStore };
