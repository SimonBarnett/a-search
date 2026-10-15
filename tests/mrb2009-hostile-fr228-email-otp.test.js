'use strict';

/**
 * MRB #2009 hostile pins for FR-228 email/SMS OTP.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('mrb2009 hostile FR-228 email/SMS OTP', () => {
  it('entry authEmail + CDK expose email/sms request and verify routes', () => {
    const entry = fs.readFileSync(path.join(ROOT, 'entry', 'src', 'authEmail.js'), 'utf8');
    assert.match(entry, /handleAuthEmailRequest/);
    assert.match(entry, /handleAuthSmsRequest/);
    assert.match(entry, /\/auth\/email\/request/);
    const stack = fs.readFileSync(path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'), 'utf8');
    assert.match(stack, /path:\s*'\/auth\/email\/request'/);
    assert.match(stack, /path:\s*'\/auth\/sms\/verify'/);
  });

  it('migration 016 targets a_search only; never SystemOTPs / madeiradb writes', () => {
    const sql = fs.readFileSync(
      path.join(ROOT, 'db', 'migrations', '016_Merchants_OtpCodes.sql'),
      'utf8',
    );
    assert.match(sql, /--\s*target:\s*a_search/);
    assert.match(sql, /Never modify madeiradb/i);
    assert.match(sql, /OtpCodes/);
    assert.match(sql, /SecretHash/);
    assert.match(sql, /SystemOTPs/);
    assert.match(sql, /Do not write SystemOTPs/i);
  });

  it('Add-shop / gates require contactVerified; sessionToken assembles JWT env keys', () => {
    const gates = fs.readFileSync(path.join(ROOT, 'shared', 'auth', 'gates.js'), 'utf8');
    assert.match(gates, /assertContactVerified/);
    assert.match(gates, /contact_unverified/);
    const shops = fs.readFileSync(path.join(ROOT, 'entry', 'src', 'merchantShops.js'), 'utf8');
    assert.match(shops, /assertContactVerified/);
    const session = fs.readFileSync(path.join(ROOT, 'shared', 'auth', 'sessionToken.js'), 'utf8');
    assert.match(session, /\['JWT',\s*'SECRET'\]\.join/);
    assert.match(session, /contactVerified/);
  });
});
