'use strict';
/** docs/mrb-2009 hostile pins for FR-228 email/SMS OTP (#2009). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('mrb2009 hostile FR-228 email/SMS OTP', () => {
  it('entry exposes email+sms request/verify and CDK routes', () => {
    const idx = read('entry/src/index.js');
    assert.match(idx, /require\('\.\/authEmail'\)/);
    assert.match(idx, /handleAuthEmailRequest/);
    assert.match(idx, /handleAuthSmsVerify/);
    const cdk = read('cdk/lib/a-search-stack.js');
    for (const p of ['/auth/email/request', '/auth/email/verify', '/auth/sms/request', '/auth/sms/verify']) {
      assert.ok(cdk.includes("path: '" + p + "'"), 'missing CDK route ' + p);
    }
  });

  it('migration 015 Merchants+OtpCodes never targets madeiradb/SystemOTPs', () => {
    const mig = read('db/migrations/015_Merchants_OtpCodes.sql');
    assert.match(mig, /-- target:\s*a_search/i);
    assert.match(mig, /OtpCodes/);
    assert.match(mig, /Merchants/);
    assert.match(mig, /Do not write SystemOTPs/);
    assert.doesNotMatch(mig, /USE\s+madeiradb/i);
    assert.match(mig, /Never modify madeiradb/i);
  });

  it('Add-shop gate requires contact verified session', () => {
    const shops = read('entry/src/merchantShops.js');
    assert.match(shops, /assertContactVerified/);
    assert.match(shops, /ContactUnverifiedError/);
  });
});
