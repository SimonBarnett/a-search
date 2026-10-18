'use strict';

/**
 * MRB #1902 docs/hostile: FR-225 shared OAuth + email magic/OTP docs lock.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function asciiNoBom(rel) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  assert.notEqual(buf[0], 0xef, rel + ' no BOM');
  for (const b of buf) assert.ok(b < 128, rel + ' ASCII');
  return buf.toString('utf8');
}

describe('MRB #1902 hostile FR-225 auth docs', () => {
  it('Decision LOCKED + fail-closed contact + magic/OTP + no Phase 5 passwords', () => {
    const fr = asciiNoBom('docs/fr/FR-225.md');
    assert.match(fr, /Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /fail[- ]?closed/i);
    assert.match(fr, /email|phone|contact/i);
    assert.match(fr, /magic|OTP/i);
    assert.match(fr, /no passwords? in Phase 5/i);
    assert.match(fr, /components-piece-auth\.md/);
    assert.match(fr, /identity\.md/);

    const auth = asciiNoBom('docs/components-piece-auth.md');
    assert.match(auth, /must return/i);
    assert.match(auth, /fail[- ]?closed/i);
    assert.match(auth, /magic link|OTP/i);
    assert.match(auth, /No password field|no passwords/i);
    assert.doesNotMatch(auth, /passwords? are required/i);
  });

  it('AL1/AL3 mocks pin contact + no password', () => {
    const home = fs.readFileSync(
      path.join(ROOT, 'docs', 'mocks', 'components-piece-auth', 'home.html'),
      'utf8',
    );
    assert.match(home, /No password/i);
    assert.match(home, /email, phone, or contact/i);
    assert.match(home, /magic link|OTP/i);

    const err = fs.readFileSync(
      path.join(ROOT, 'docs', 'mocks', 'components-piece-auth', 'error.html'),
      'utf8',
    );
    assert.match(err, /no contact/i);
  });

  it('product pin suite present', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'tests', 'fr225-auth-docs.test.js')),
    );
  });
});
