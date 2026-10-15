'use strict';

/**
 * FR-229 / #1239: shared login entry for merchant / partner / club.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-229.md');
const LOGIN_HTML = path.join(ROOT, 'components-piece', 'login', 'index.html');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const ENTRY = path.join(ROOT, 'entry', 'src', 'index.js');
const SHARED_PKG = path.join(ROOT, 'shared', 'package.json');

const {
  createSharedSession,
  resolvePostLoginRedirect,
  assertSessionForIntent,
  assertSingleLoginStack,
  LoginEntryError,
  REDIRECTS,
} = require('../shared/auth/loginEntry');

const {
  matchLoginEntryRoute,
  handleLoginEntry,
} = require('../entry/src/loginEntry');

describe('FR-229 shared login entry', () => {
  it('docs/fr/FR-229.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-229.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /shared login|one login stack/i);
    assert.match(text, /merchant|partner|club/i);
    assert.match(text, /post-login redirect|redirect/i);
    assert.match(text, /no password|Phase 5/i);
  });

  it('components-piece/login is the shared stack (not three pages)', () => {
    const html = fs.readFileSync(LOGIN_HTML, 'utf8');
    assert.match(html, /data-login-stack="shared"/);
    assert.match(html, /Merchant|Partner|Club/);
    assert.doesNotMatch(html, /type=["']password["']/i);
    assert.ok(!fs.existsSync(path.join(ROOT, 'components-piece', 'merchant-login')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'components-piece', 'partner-login')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'components-piece', 'club-login')));
  });

  it('same session valid on merchant and partner entry fixtures', () => {
    const session = createSharedSession({
      userId: 'TESTUSR1',
      email: 'user@example.com',
      intent: 'merchant',
    });
    assert.equal(session.stack, 'shared');
    assert.equal(session.userId, 'TESTUSR1');
    assert.equal(session.role, 'merchant');
    assert.equal(assertSessionForIntent(session, 'merchant'), true);
    assert.equal(assertSessionForIntent(session, 'partner'), true);
    assert.equal(assertSessionForIntent(session, 'club'), true);
    assert.equal(
      resolvePostLoginRedirect({ session }),
      REDIRECTS.merchant,
    );
    assert.equal(
      resolvePostLoginRedirect({ intent: 'partner' }),
      REDIRECTS.partner,
    );
  });

  it('fail closed without contact; fail-when divergent auth stacks', () => {
    assert.throws(
      () => createSharedSession({ userId: 'TESTUSR1', intent: 'club' }),
      (err) => err instanceof LoginEntryError && err.code === 'contact_required',
    );
    assert.throws(
      () =>
        assertSingleLoginStack([
          'shared/auth/loginEntry.js',
          'shared/auth/loginEntry.js',
        ]),
      (err) =>
        err instanceof LoginEntryError && err.code === 'divergent_auth_stacks',
    );
    assert.throws(
      () =>
        assertSingleLoginStack([
          'shared/auth/loginEntry.js',
          'entry/src/merchantAuth.js',
        ]),
      (err) =>
        err instanceof LoginEntryError && err.code === 'divergent_auth_stacks',
    );
    assert.equal(
      assertSingleLoginStack(['shared/auth/loginEntry.js', 'entry/src/loginEntry.js']),
      true,
    );
  });

  it('POST /auth/session and GET /auth/redirect handlers', async () => {
    assert.equal(matchLoginEntryRoute('POST', '/auth/session'), 'POST /auth/session');
    assert.equal(matchLoginEntryRoute('GET', '/auth/redirect'), 'GET /auth/redirect');
    const created = await handleLoginEntry(
      {
        body: JSON.stringify({
          userId: 'ABC12345',
          email: 'a@b.co',
          intent: 'partner',
        }),
      },
      'POST /auth/session',
    );
    assert.equal(created.statusCode, 200);
    const payload = JSON.parse(created.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.session.stack, 'shared');
    assert.equal(payload.redirect, REDIRECTS.partner);

    const denied = await handleLoginEntry(
      { body: JSON.stringify({ userId: 'ABC12345', intent: 'merchant' }) },
      'POST /auth/session',
    );
    assert.equal(denied.statusCode, 403);

    const redir = await handleLoginEntry(
      { queryStringParameters: { intent: 'club' } },
      'GET /auth/redirect',
    );
    assert.equal(redir.statusCode, 200);
    assert.equal(JSON.parse(redir.body).redirect, REDIRECTS.club);
  });

  it('CDK + entry wire /auth/session and /auth/redirect; shared files lists auth/', () => {
    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/auth\/session'/);
    assert.match(stack, /path:\s*'\/auth\/redirect'/);
    assert.match(stack, /FR-229/);
    const entry = fs.readFileSync(ENTRY, 'utf8');
    assert.match(entry, /matchLoginEntryRoute/);
    assert.match(entry, /handleLoginEntry/);
    const pkg = JSON.parse(fs.readFileSync(SHARED_PKG, 'utf8'));
    assert.ok(pkg.files.includes('auth/'), 'shared/package.json files must list auth/');
  });
});
