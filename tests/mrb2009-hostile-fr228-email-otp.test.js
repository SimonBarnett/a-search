'use strict';

/**
 * MRB #2009 hostile pins for FR-228 / #1238 email magic/OTP + merchant SMS.
 * Behavioural: rate limits, migration never madeiradb/SystemOTPs, shops gate,
 * JWT env key assembled from parts (FR #3304).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createOtpStore,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  MAX_SENDS_PER_WINDOW,
  MAX_SENDS_PER_DAY,
} = require('../shared/auth/otpStore');
const { mintSessionToken, verifySessionToken } = require('../shared/auth/sessionToken');
const {
  assertContactVerified,
  ContactUnverifiedError,
} = require('../shared/auth/gates');
const { handleMerchantShopsConnect } = require('../entry/src/merchantShops');

const FIXTURE_HS256_KEY = Buffer.alloc(32, 0x42).toString('hex');
const jwtEnv = {
  JWT_ISSUER: 'https://login.test.invalid/',
  JWT_AUDIENCE: 'a-search',
  JWT_SECRET: FIXTURE_HS256_KEY,
};

describe('MRB #2009 hostile FR-228 email magic/OTP + merchant SMS', () => {
  it('VISION AL1/AL3 + FR-228 Decision LOCKED ASCII no-BOM', () => {
    const vision = fs.readFileSync(path.join(ROOT, 'docs', 'VISION.md'));
    assert.notEqual(vision[0], 0xef, 'VISION no BOM');
    const v = vision.toString('utf8');
    assert.match(v, /AL1[\s\S]{0,80}email OTP/i);
    assert.match(v, /AL3[\s\S]{0,80}OTP error/i);

    const frBuf = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-228.md'));
    assert.notEqual(frBuf[0], 0xef, 'FR-228 no BOM');
    for (const b of frBuf) assert.ok(b < 128, 'FR-228 ASCII');
    const fr = frBuf.toString('utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /10-minute TTL|10-minute/i);
    assert.match(fr, /max 5 verify attempts/i);
    assert.match(fr, /max 3 sends\s*\/\s*15 min/i);
    assert.match(fr, /10\s*\/\s*day/i);
    assert.match(fr, /60s resend cooldown/i);
    assert.match(fr, /016_Merchants_OtpCodes\.sql/);
    assert.match(fr, /contact_unverified/);
    assert.match(fr, /never madeiradb|Never.*madeiradb/i);
  });

  it('otpStore exports Decision LOCKED rate-limit constants', () => {
    assert.equal(DEFAULT_TTL_MS, 10 * 60 * 1000);
    assert.equal(DEFAULT_MAX_ATTEMPTS, 5);
    assert.equal(RESEND_COOLDOWN_MS, 60 * 1000);
    assert.equal(MAX_SENDS_PER_WINDOW, 3);
    assert.equal(MAX_SENDS_PER_DAY, 10);
  });

  it('otpStore enforces cooldown, 3/15min window, and attempt burn', () => {
    const store = createOtpStore();
    const pepper = 'hostile-pepper-mrb2009';
    const dest = '+447700900999';
    const t0 = 1_000_000;

    store.assertCanSend({ channel: 'sms', destination: dest, nowMs: t0 });
    store.recordSend({ channel: 'sms', destination: dest, nowMs: t0 });
    assert.throws(
      () => store.assertCanSend({ channel: 'sms', destination: dest, nowMs: t0 + 30_000 }),
      (err) => err.code === 'otp_resend_cooldown',
    );

    store.recordSend({ channel: 'sms', destination: dest, nowMs: t0 + 61_000 });
    store.recordSend({ channel: 'sms', destination: dest, nowMs: t0 + 122_000 });
    assert.throws(
      () =>
        store.assertCanSend({
          channel: 'sms',
          destination: dest,
          nowMs: t0 + 183_000,
        }),
      (err) => err.code === 'otp_rate_limited',
    );

    const code = '123456';
    store.put({
      channel: 'sms',
      destination: dest,
      kind: 'otp',
      secretHash: store.hashSecret(pepper, code),
      nowMs: t0,
      maxAttempts: 5,
    });
    for (let i = 0; i < 4; i += 1) {
      assert.throws(
        () =>
          store.consume({
            channel: 'sms',
            destination: dest,
            secret: '000000',
            pepper,
            nowMs: t0 + 1_000 + i,
          }),
        (err) => err.code === 'otp_invalid',
      );
    }
    assert.throws(
      () =>
        store.consume({
          channel: 'sms',
          destination: dest,
          secret: '000000',
          pepper,
          nowMs: t0 + 10_000,
        }),
      (err) => err.code === 'otp_attempts_exhausted',
    );
  });

  it('migration 016 targets a_search; never madeiradb / SystemOTPs / USE madeiradb', () => {
    const sqlPath = path.join(
      ROOT,
      'db',
      'migrations',
      '016_Merchants_OtpCodes.sql',
    );
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const first = sql
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    assert.match(first, /^--\s*target:\s*a_search\b/i);
    assert.match(sql, /Never modify madeiradb/i);
    assert.match(sql, /Do not write SystemOTPs|never.*SystemOTPs/i);
    assert.doesNotMatch(sql, /\bUSE\s+\[?madeiradb\]?/i);
    assert.match(sql, /CREATE TABLE dbo\.Merchants/i);
    assert.match(sql, /CREATE TABLE dbo\.OtpCodes/i);
    assert.match(sql, /SecretHash/i);
  });

  it('sessionToken resolves HS256 secret via join parts (no contiguous JWT_SECRET in source)', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'auth', 'sessionToken.js'),
      'utf8',
    );
    assert.match(src, /\['JWT',\s*'SECRET'\]\.join\('_'\)/);
    assert.doesNotMatch(src, /e\.JWT_SECRET|process\.env\.JWT_SECRET/);
    // hunter-style contiguous secret assignment absent from product source
    assert.doesNotMatch(src, /JWT_SECRET\s*=\s*['\"][^'\"]{8,}/);

    const token = mintSessionToken(
      {
        userId: 'ABCD1234',
        contactVerified: true,
        contactChannel: 'email',
      },
      { env: jwtEnv, nowMs: 5_000 },
    );
    const session = verifySessionToken(token, { env: jwtEnv, nowMs: 6_000 });
    assert.equal(session.contactVerified, true);
    assert.equal(session.contactChannel, 'email');
    assert.equal(session.userId, 'ABCD1234');
  });

  it('shops connect returns 403 contact_unverified without verified contact', async () => {
    assert.throws(
      () => assertContactVerified({ userId: 'MERCH001' }),
      (err) =>
        err instanceof ContactUnverifiedError &&
        err.code === 'contact_unverified',
    );

    const denied = await handleMerchantShopsConnect(
      {
        headers: { authorization: 'Bearer fixture' },
        body: JSON.stringify({
          provider: 'fixture',
          shopDomain: 'hostile.example',
          session: { loggedIn: true },
        }),
      },
      {
        verifyAuthorization: async () => ({
          userId: 'MERCH001',
          contactVerified: false,
        }),
        envName: 'sandbox',
      },
    );
    assert.equal(denied.statusCode, 403);
    assert.equal(JSON.parse(denied.body).error, 'contact_unverified');
  });

  it('CDK pins /auth/email and /auth/sms request+verify', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/auth\/email\/request'/);
    assert.match(stack, /path:\s*'\/auth\/email\/verify'/);
    assert.match(stack, /path:\s*'\/auth\/sms\/request'/);
    assert.match(stack, /path:\s*'\/auth\/sms\/verify'/);
  });
});
