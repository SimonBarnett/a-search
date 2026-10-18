'use strict';

/**
 * MRB #2011 docs/hostile: FR-229 shared login entry.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createSharedSession,
  resolvePostLoginRedirect,
  assertSessionForIntent,
  REDIRECTS,
} = require('../shared/auth/loginEntry');

describe('MRB #2011 hostile FR-229 shared login entry', () => {
  it('Decision LOCKED; shared session; redirects; CDK+entry; auth packed', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-229.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /\/auth\/session/);
    assert.match(fr, /\/auth\/redirect/);
    assert.match(fr, /loginEntry\.js/);

    const session = createSharedSession({
      userId: 'ABCD1234',
      email: 'a@example.com',
      intent: 'merchant',
    });
    assert.equal(session.userId, 'ABCD1234');
    assert.equal(session.stack, 'shared');
    assert.equal(session.intent, 'merchant');
    assert.doesNotThrow(() => assertSessionForIntent(session, 'merchant'));
    assert.doesNotThrow(() => assertSessionForIntent(session, 'partner'));

    const red = resolvePostLoginRedirect({ intent: 'partner' });
    assert.equal(red, REDIRECTS.partner);

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/auth\/session'/);
    assert.match(stack, /path:\s*'\/auth\/redirect'/);

    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /handleLoginEntry/);
    assert.match(index, /handleAccountPayouts/);
    assert.match(index, /handlePartnerRegister/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('auth/'));
    assert.ok(
      fs.existsSync(path.join(ROOT, 'components-piece', 'login', 'index.html')),
    );
  });
});
