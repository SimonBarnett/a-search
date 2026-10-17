'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAsearchOtpStore } = require('../shared/auth/otpStoreSql');
const { hashSecret } = require('../shared/auth/otpStore');
const { handleAuthEmailRequest } = require('../entry/src/authEmail');

function fakeDb() {
  const rows = [];
  let id = 1;
  async function query(sql, params) {
    const text = String(sql);
    assert.equal(/madeiradb/i.test(text), false);
    if (text.startsWith('SELECT CreatedAt')) {
      return rows
        .filter((r) => r.Channel === params.channel && r.Destination === params.destination)
        .map((r) => ({ CreatedAt: r.CreatedAt }));
    }
    if (text.startsWith('UPDATE dbo.OtpCodes SET UsedAt = @createdAt')) {
      for (const r of rows) {
        if (r.Channel === params.channel && r.Destination === params.destination && r.UsedAt == null) {
          r.UsedAt = params.createdAt;
        }
      }
      return [];
    }
    if (text.startsWith('INSERT INTO dbo.OtpCodes')) {
      rows.push({
        OtpId: id++,
        Channel: params.channel,
        Destination: params.destination,
        Kind: params.kind,
        SecretHash: params.secretHash,
        ExpiresAt: params.expiresAt,
        Attempts: 0,
        MaxAttempts: params.maxAttempts,
        CreatedAt: params.createdAt,
        UsedAt: null,
      });
      return [];
    }
    if (text.startsWith('SELECT TOP 1')) {
      const found = rows.filter(
        (r) => r.Channel === params.channel && r.Destination === params.destination && r.UsedAt == null,
      );
      found.sort((a, b) => String(b.CreatedAt).localeCompare(String(a.CreatedAt)));
      return found.slice(0, 1);
    }
    if (text.startsWith('UPDATE dbo.OtpCodes SET UsedAt = @usedAt')) {
      const row = rows.find((r) => r.OtpId === params.otpId);
      if (row) row.UsedAt = params.usedAt;
      return [];
    }
    if (text.startsWith('UPDATE dbo.OtpCodes SET Attempts')) {
      const row = rows.find((r) => r.OtpId === params.otpId);
      if (row) row.Attempts = params.attempts;
      return [];
    }
    if (text.startsWith('DELETE FROM dbo.OtpCodes')) {
      rows.length = 0;
      return [];
    }
    throw new Error('unexpected sql ' + text);
  }
  return { query, rows };
}

describe('FR #3655 a_search OTP store', () => {
  it('module writes dbo.OtpCodes on a_search and never names madeiradb', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'shared', 'auth', 'otpStoreSql.js'),
      'utf8',
    );
    assert.match(text, /a_search\.dbo\.OtpCodes/);
    assert.match(text, /dbo\.OtpCodes/);
    assert.equal(/madeiradb/i.test(text), false);
  });

  it('hash and rate limit survive a second store on the same tables', async () => {
    const db = fakeDb();
    const now = Date.parse('2026-10-17T05:00:00.000Z');
    const pepper = 'pep';
    const first = createAsearchOtpStore({ query: db.query });
    await first.assertCanSend({ channel: 'email', destination: 'A@B.co', nowMs: now });
    await first.put({
      channel: 'email',
      destination: 'A@B.co',
      kind: 'otp',
      secretHash: hashSecret(pepper, '123456'),
      nowMs: now,
    });
    await first.recordSend({ channel: 'email', destination: 'a@b.co', nowMs: now });

    const second = createAsearchOtpStore({ query: db.query });
    await assert.rejects(
      () => second.assertCanSend({ channel: 'email', destination: 'a@b.co', nowMs: now + 1000 }),
      (err) => err.code === 'otp_resend_cooldown',
    );
    const consumed = await second.consume({
      channel: 'email',
      destination: 'a@b.co',
      secret: '123456',
      pepper,
      kind: 'otp',
      nowMs: now + 1000,
    });
    assert.equal(consumed.destination, 'a@b.co');
    await assert.rejects(
      () => second.consume({
        channel: 'email',
        destination: 'a@b.co',
        secret: '123456',
        pepper,
        kind: 'otp',
        nowMs: now + 1000,
      }),
      (err) => err.code === 'otp_invalid',
    );
    assert.equal(db.rows[0].UsedAt != null, true);
  });

  it('auth email request inserts OtpCodes when query is injected', async () => {
    const db = fakeDb();
    let sent = 0;
    const res = await handleAuthEmailRequest(
      { body: JSON.stringify({ email: 'merchant@example.com' }), rawPath: '/auth/email/request', requestContext: { http: { method: 'POST' } } },
      {
        query: db.query,
        mailer: { send: async () => { sent += 1; } },
        env: { OTP_PEPPER: 'pep' },
        nowMs: Date.parse('2026-10-17T05:10:00.000Z'),
      },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(sent, 1);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0].Destination, 'merchant@example.com');
    assert.equal(db.rows[0].Channel, 'email');
  });
});
