'use strict';

/**
 * MRB #3654 hostile: FR-228 / #3655 otpStoreSql is selectable when deps.query
 * is injected; default without query stays the in-memory store (otpStore.js).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('mrb3654 hostile: FR-228 otp SQL wire', () => {
  it('authEmail storeFor uses createAsearchOtpStore when query is injected', () => {
    const text = fs.readFileSync(path.join(ROOT, 'entry/src/authEmail.js'), 'utf8');
    assert.match(text, /createAsearchOtpStore/);
    assert.match(text, /createOtpStore\(\)/);
    assert.match(
      text,
      /if\s*\(\s*deps\s*&&\s*typeof\s+deps\.query\s*===\s*['"]function['"]\s*\)\s*return\s+createAsearchOtpStore/,
    );
    assert.match(text, /otpStoreSql/);
  });

  it('otpStoreSql targets a_search.dbo.OtpCodes and never madeiradb', () => {
    const text = fs.readFileSync(path.join(ROOT, 'shared/auth/otpStoreSql.js'), 'utf8');
    assert.match(text, /a_search\.dbo\.OtpCodes/);
    assert.match(text, /INSERT INTO dbo\.OtpCodes/);
    assert.equal(/madeiradb/i.test(text), false);
  });

  it('index.js routes all four FR-228 auth paths through authEmail handlers', () => {
    const text = fs.readFileSync(path.join(ROOT, 'entry/src/index.js'), 'utf8');
    for (const route of [
      'POST /auth/email/request',
      'POST /auth/email/verify',
      'POST /auth/sms/request',
      'POST /auth/sms/verify',
    ]) {
      assert.match(text, new RegExp(route.replace(/\//g, '\\/')));
    }
    assert.match(text, /handleAuthEmailRequest/);
    assert.match(text, /handleAuthSmsVerify/);
  });
});
