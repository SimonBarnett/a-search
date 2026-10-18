'use strict';

/**
 * FR-225 / #1235: Docs lock shared OAuth registry + email magic/OTP.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-225.md');
const AUTH_DOC = path.join(ROOT, 'docs', 'components-piece-auth.md');
const IDENTITY = path.join(ROOT, 'docs', 'identity.md');
const MOCK_HOME = path.join(
  ROOT,
  'docs',
  'mocks',
  'components-piece-auth',
  'home.html',
);
const MOCK_ERR = path.join(
  ROOT,
  'docs',
  'mocks',
  'components-piece-auth',
  'error.html',
);

function assertAsciiNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.notEqual(buf[0], 0xef, filePath + ' no BOM');
  for (const b of buf) assert.ok(b < 128, filePath + ' must be ASCII');
  return buf.toString('utf8');
}

describe('FR-225 auth docs lock', () => {
  it('FR-225 Decision LOCKED + components-piece-auth.md ASCII', () => {
    const fr = assertAsciiNoBom(FR_DOC);
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /email|phone|contact/i);
    assert.match(fr, /magic|OTP/i);
    assert.match(fr, /password/i);
    assert.match(fr, /fail[- ]?closed|fail closed/i);
    assert.match(fr, /identity\.md/);
    assert.match(fr, /components-piece-auth\.md/);

    const auth = assertAsciiNoBom(AUTH_DOC);
    assert.match(auth, /OAuth/i);
    assert.match(auth, /email|phone|contact/i);
    assert.match(auth, /magic link|OTP/i);
    assert.match(auth, /fail[- ]?closed|fail closed/i);
    assert.match(auth, /identity\.md/);
    assert.match(auth, /no password|without password|password not/i);
    assert.ok(fs.existsSync(IDENTITY), 'docs/identity.md');
  });

  it('pins contact-required rule; magic/OTP email path; not password-only', () => {
    const auth = fs.readFileSync(AUTH_DOC, 'utf8');
    assert.match(
      auth,
      /must (return|provide|expose).{0,40}(email|phone|contact)/i,
    );
    assert.match(auth, /fail[- ]?closed/i);
    assert.match(auth, /magic link|OTP/i);
    assert.doesNotMatch(
      auth,
      /passwords? are required|must use a password|password[- ]only (auth|login|path)/i,
    );

    const home = fs.readFileSync(MOCK_HOME, 'utf8');
    assert.match(home, /magic link|OTP/i);
    assert.match(home, /No password/i);
    assert.match(home, /email, phone, or contact/i);

    const err = fs.readFileSync(MOCK_ERR, 'utf8');
    assert.match(err, /no contact/i);
    assert.match(err, /email, phone, or contact/i);
  });

  it('fail-when: docs must not require password-only auth', () => {
    const fr = fs.readFileSync(FR_DOC, 'utf8');
    const auth = fs.readFileSync(AUTH_DOC, 'utf8');
    for (const text of [fr, auth]) {
      assert.doesNotMatch(text, /password-only Phase 5/i);
      assert.doesNotMatch(text, /passwords are required/i);
      assert.match(text, /no passwords? in Phase 5|Phase 5.{0,40}no password/i);
    }
  });
});
