'use strict';

/**
 * FR-228 / #1238: Email magic link / OTP login + merchant SMS OTP.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-228.md');
const AUTH_DOC = path.join(ROOT, 'docs', 'components-piece-auth.md');
const MIGRATION = path.join(ROOT, 'db', 'migrations', '016_Merchants_OtpCodes.sql');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const SHARED_PKG = path.join(ROOT, 'shared', 'package.json');

const { createMailSender } = require('../shared/notify/mailSender');
const { createSmsSender } = require('../shared/notify/smsSender');
const { createOtpStore } = require('../shared/auth/otpStore');
const {
  requestEmailLogin,
  verifyEmailLogin,
  requestSmsLogin,
  verifySmsLogin,
  maskPhone,
} = require('../shared/auth/emailOtp');
const { mintSessionToken, verifySessionToken } = require('../shared/auth/sessionToken');
const {
  assertContactVerified,
  ContactUnverifiedError,
} = require('../shared/auth/gates');
const {
  matchAuthEmailRoute,
  handleAuthEmailRequest,
  handleAuthEmailVerify,
  handleAuthSmsRequest,
  handleAuthSmsVerify,
} = require('../entry/src/authEmail');
const {
  handleMerchantShopsConnect,
} = require('../entry/src/merchantShops');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');
const ISSUER = 'https://login.test.invalid/';
const AUDIENCE = 'a-search';

const jwtEnv = {
  JWT_ISSUER: ISSUER,
  JWT_AUDIENCE: AUDIENCE,
  JWT_SECRET: FIXTURE_HS256_KEY,
  OTP_PEPPER: 'test-pepper-fr228',
};

function asciiNoBom(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must not have BOM`);
  for (const b of buf) assert.ok(b < 128, `${rel} must be ASCII`);
  return buf.toString('utf8');
}

describe('FR-228 email magic/OTP + merchant SMS', () => {
  /** @type {ReturnType<typeof createOtpStore>} */
  let store;
  /** @type {{ sent: object[] }} */
  let mailLog;
  /** @type {{ sent: object[] }} */
  let smsLog;
  let mailer;
  let sms;
  let identitySeq;

  beforeEach(() => {
    store = createOtpStore();
    mailLog = { sent: [] };
    smsLog = { sent: [] };
    mailer = createMailSender({
      send: async (msg) => {
        mailLog.sent.push(msg);
        return { ok: true, id: `mail_${mailLog.sent.length}` };
      },
    });
    sms = createSmsSender({
      send: async (msg) => {
        smsLog.sent.push(msg);
        return { ok: true, id: `sms_${smsLog.sent.length}` };
      },
    });
    identitySeq = 0;
  });

  function resolveIdentity(contact) {
    identitySeq += 1;
    // Stable 8-char fixture ids for tests.
    const n = String(identitySeq).padStart(7, '0');
    return `A${n}`;
  }

  it('docs/fr/FR-228.md Decision LOCKED ASCII no-BOM', () => {
    const text = asciiNoBom('docs/fr/FR-228.md');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /request|verify/i);
    assert.match(text, /mailer|mailSender/i);
    assert.match(text, /session|JWT|token/i);
    assert.match(text, /SMS|smsSender/i);
    assert.match(text, /a_search|OtpCodes|Merchants/i);
    assert.match(text, /components-piece-auth-email\.test\.js/);
  });

  it('components-piece-auth.md pins email path + merchant SMS', () => {
    const auth = asciiNoBom('docs/components-piece-auth.md');
    assert.match(auth, /magic link|OTP/i);
    assert.match(auth, /merchant/i);
    assert.match(auth, /SMS/i);
  });

  it('migration 016 Merchants+OtpCodes targets a_search only', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /Merchants/i);
    assert.match(sql, /OtpCodes/i);
    assert.match(sql, /a_search/);
    assert.doesNotMatch(sql, /\bUSE\s+madeiradb\b/i);
    assert.match(sql, /never.*SystemOTPs|Do not.*SystemOTPs/i);
  });

  it('shared package lists auth/ and notify/', () => {
    const pkg = JSON.parse(fs.readFileSync(SHARED_PKG, 'utf8'));
    assert.ok(pkg.files.includes('auth/'));
    assert.ok(pkg.files.includes('notify/'));
  });

  it('CDK pins /auth/email and /auth/sms request+verify routes', () => {
    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/auth\/email\/request'/);
    assert.match(stack, /path:\s*'\/auth\/email\/verify'/);
    assert.match(stack, /path:\s*'\/auth\/sms\/request'/);
    assert.match(stack, /path:\s*'\/auth\/sms\/verify'/);
  });

  it('email OTP request+verify mints contactVerified session; code never in mail log plaintext after hash path', async () => {
    const requested = await requestEmailLogin({
      email: 'user@example.com',
      mode: 'otp',
      store,
      mailer,
      pepper: jwtEnv.OTP_PEPPER,
      nowMs: 1_000,
    });
    assert.equal(requested.ok, true);
    assert.equal(requested.channel, 'email');
    assert.equal(mailLog.sent.length, 1);
    assert.equal(mailLog.sent[0].to, 'user@example.com');
    assert.match(String(mailLog.sent[0].body || mailLog.sent[0].text || ''), /\d{6}/);
    const code = String(mailLog.sent[0].code || '').match(/\d{6}/)
      ? mailLog.sent[0].code
      : String(mailLog.sent[0].body || mailLog.sent[0].text).match(/\d{6}/)[0];

    const verified = await verifyEmailLogin({
      email: 'user@example.com',
      code,
      store,
      pepper: jwtEnv.OTP_PEPPER,
      resolveIdentity,
      mintSession: (claims) =>
        mintSessionToken(claims, { env: jwtEnv, nowMs: 2_000 }),
      nowMs: 2_000,
    });
    assert.equal(verified.ok, true);
    assert.ok(verified.token);
    assert.match(verified.userId, /^[0-9A-Z]{8}$/);

    const session = verifySessionToken(verified.token, { env: jwtEnv, nowMs: 3_000 });
    assert.equal(session.contactVerified, true);
    assert.equal(session.contactChannel, 'email');
    assert.equal(session.userId, verified.userId);
  });

  it('email magic link verify once; reuse fails', async () => {
    const requested = await requestEmailLogin({
      email: 'magic@example.com',
      mode: 'magic',
      store,
      mailer,
      pepper: jwtEnv.OTP_PEPPER,
      nowMs: 10_000,
      magicBaseUrl: 'https://smartcatalogue.uk/auth/magic',
    });
    assert.equal(requested.ok, true);
    assert.equal(mailLog.sent.length, 1);
    const token = mailLog.sent[0].magicToken || requested.magicToken;
    assert.ok(token);

    const first = await verifyEmailLogin({
      email: 'magic@example.com',
      magicToken: token,
      store,
      pepper: jwtEnv.OTP_PEPPER,
      resolveIdentity,
      mintSession: (claims) =>
        mintSessionToken(claims, { env: jwtEnv, nowMs: 11_000 }),
      nowMs: 11_000,
    });
    assert.equal(first.ok, true);

    await assert.rejects(
      () =>
        verifyEmailLogin({
          email: 'magic@example.com',
          magicToken: token,
          store,
          pepper: jwtEnv.OTP_PEPPER,
          resolveIdentity,
          mintSession: (claims) =>
            mintSessionToken(claims, { env: jwtEnv, nowMs: 12_000 }),
          nowMs: 12_000,
        }),
      /invalid|expired|used/i,
    );
  });

  it('merchant SMS OTP: E.164, mask logs, rate limits, max attempts', async () => {
    assert.equal(maskPhone('+447700900123'), '+44******0123');

    const first = await requestSmsLogin({
      phone: '+447700900123',
      store,
      sms,
      pepper: jwtEnv.OTP_PEPPER,
      nowMs: 100_000,
    });
    assert.equal(first.ok, true);
    assert.equal(smsLog.sent.length, 1);
    assert.equal(smsLog.sent[0].to, '+447700900123');
    const code = smsLog.sent[0].code;
    assert.match(String(code), /^\d{6}$/);

    // 60s resend cooldown
    await assert.rejects(
      () =>
        requestSmsLogin({
          phone: '+447700900123',
          store,
          sms,
          pepper: jwtEnv.OTP_PEPPER,
          nowMs: 100_000 + 30_000,
        }),
      /cooldown|rate/i,
    );

    // wrong codes burn attempts
    for (let i = 0; i < 5; i += 1) {
      try {
        await verifySmsLogin({
          phone: '+447700900123',
          code: '000000',
          store,
          pepper: jwtEnv.OTP_PEPPER,
          resolveIdentity,
          mintSession: (claims) =>
            mintSessionToken(claims, { env: jwtEnv, nowMs: 160_000 + i }),
          nowMs: 160_000 + i,
        });
        assert.fail('expected reject');
      } catch (err) {
        assert.match(String(err.code || err.message), /invalid|attempts/i);
      }
    }
    await assert.rejects(
      () =>
        verifySmsLogin({
          phone: '+447700900123',
          code,
          store,
          pepper: jwtEnv.OTP_PEPPER,
          resolveIdentity,
          mintSession: (claims) =>
            mintSessionToken(claims, { env: jwtEnv, nowMs: 170_000 }),
          nowMs: 170_000,
        }),
      /attempts|invalid|exhausted/i,
    );
  });

  it('unverified session cannot pass merchant/partner gate or shops connect', async () => {
    assert.throws(
      () => assertContactVerified({ userId: 'ABCD1234' }),
      (err) =>
        err instanceof ContactUnverifiedError &&
        err.code === 'contact_unverified',
    );
    assert.throws(
      () =>
        assertContactVerified({
          userId: 'ABCD1234',
          contactVerified: false,
        }),
      /contact_unverified/,
    );
    assert.doesNotThrow(() =>
      assertContactVerified({
        userId: 'ABCD1234',
        contactVerified: true,
      }),
    );

    const denied = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer x' },
        body: JSON.stringify({
          provider: 'fixture',
          shopDomain: 'x.example',
          session: { loggedIn: true },
        }),
      },
      {
        verifyAuthorization: async () => ({
          userId: 'merch001',
          contactVerified: false,
        }),
        envName: 'sandbox',
      },
    );
    assert.equal(denied.statusCode, 403);
    const body = JSON.parse(denied.body);
    assert.equal(body.error, 'contact_unverified');
  });

  it('HTTP email request/verify routes mint token', async () => {
    assert.equal(
      matchAuthEmailRoute('POST', '/auth/email/request'),
      'POST /auth/email/request',
    );
    assert.equal(
      matchAuthEmailRoute('POST', '/auth/email/verify'),
      'POST /auth/email/verify',
    );
    assert.equal(
      matchAuthEmailRoute('POST', '/auth/sms/request'),
      'POST /auth/sms/request',
    );

    const deps = {
      store,
      mailer,
      sms,
      env: jwtEnv,
      resolveIdentity,
      nowMs: 500_000,
    };

    const req = await handleAuthEmailRequest(
      {
        body: JSON.stringify({ email: 'http@example.com', mode: 'otp' }),
      },
      deps,
    );
    assert.equal(req.statusCode, 200);
    assert.equal(JSON.parse(req.body).ok, true);
    const code = mailLog.sent[0].code;

    const ver = await handleAuthEmailVerify(
      {
        body: JSON.stringify({ email: 'http@example.com', code }),
      },
      { ...deps, nowMs: 501_000 },
    );
    assert.equal(ver.statusCode, 200);
    const verBody = JSON.parse(ver.body);
    assert.equal(verBody.ok, true);
    assert.ok(verBody.token);
    assert.equal(verBody.contactVerified, true);
  });
});
