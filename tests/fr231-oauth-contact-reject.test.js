'use strict';

/**
 * FR-231: Reject OAuth login when no email/phone/contact (fail closed).
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const {
  AuthContactError,
  clearAuthAdapters,
  registerAuthAdapter,
  acceptAuthResult,
} = require('../shared/auth/registry');
const { createFixtureAdapter } = require('../shared/auth/adapters/fixture');
const {
  OAUTH_NO_CONTACT_CODE,
  OAUTH_NO_CONTACT_MESSAGE,
  completeOAuthLogin,
} = require('../shared/auth/oauthCallback');
const {
  matchOAuthCallbackRoute,
  handleOAuthCallback,
} = require('../entry/src/oauthCallback');

describe('FR-231 oauth contact reject', () => {
  beforeEach(() => {
    clearAuthAdapters();
    registerAuthAdapter('fixture_auth', createFixtureAdapter('fixture_auth'));
  });
  afterEach(() => {
    clearAuthAdapters();
  });

  it('fixture empty contact => AuthContactError; acceptAuthResult fails closed', async () => {
    const adapter = createFixtureAdapter('fixture_auth');
    await assert.rejects(
      () =>
        adapter.exchange({
          code: 'x',
          profile: { subject: 'empty-sub' },
        }),
      (err) =>
        err instanceof AuthContactError && err.code === 'contact_required',
    );
    assert.throws(
      () =>
        acceptAuthResult({
          provider: 'fixture_auth',
          subject: 'empty-sub',
        }),
      (err) =>
        err instanceof AuthContactError && err.code === 'contact_required',
    );
  });

  it('completeOAuthLogin empty contact => AL3 copy; createIdentity never called', async () => {
    let createCalls = 0;
    const result = await completeOAuthLogin(
      {
        provider: 'fixture_auth',
        code: 'fixture',
        profile: { subject: 'no-contact' },
      },
      {
        createIdentityRow: async () => {
          createCalls += 1;
          return { userId: 'SHOULDNOT' };
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, OAUTH_NO_CONTACT_CODE);
    assert.equal(result.message, OAUTH_NO_CONTACT_MESSAGE);
    assert.equal(result.al, 'AL3');
    assert.equal(createCalls, 0);
    assert.equal(result.session, undefined);
    assert.equal(result.userId, undefined);
  });

  it('completeOAuthLogin with email mints identity once and returns session', async () => {
    let createCalls = 0;
    const result = await completeOAuthLogin(
      {
        provider: 'fixture_auth',
        code: 'fixture',
        profile: {
          subject: 'ok-sub',
          email: 'ok@example.com',
        },
        intent: 'merchant',
      },
      {
        createIdentityRow: async (claims) => {
          createCalls += 1;
          assert.equal(claims.email, 'ok@example.com');
          return { userId: 'TESTUSR1' };
        },
      },
    );
    assert.equal(result.ok, true);
    assert.equal(createCalls, 1);
    assert.equal(result.session.userId, 'TESTUSR1');
    assert.equal(result.session.email, 'ok@example.com');
    assert.equal(result.session.stack, 'shared');
  });

  it('POST /auth/oauth/callback HTTP: empty contact 403 AL3; email accepts', async () => {
    assert.equal(
      matchOAuthCallbackRoute('POST', '/auth/oauth/callback'),
      'POST /auth/oauth/callback',
    );
    let createCalls = 0;
    const denied = await handleOAuthCallback(
      {
        body: JSON.stringify({
          provider: 'fixture_auth',
          code: 'fixture',
          profile: { subject: 'http-empty' },
        }),
      },
      'POST /auth/oauth/callback',
      {
        createIdentityRow: async () => {
          createCalls += 1;
          return { userId: 'NOPE' };
        },
      },
    );
    assert.equal(denied.statusCode, 403);
    const deniedBody = JSON.parse(denied.body);
    assert.equal(deniedBody.ok, false);
    assert.equal(deniedBody.error, OAUTH_NO_CONTACT_CODE);
    assert.equal(deniedBody.message, OAUTH_NO_CONTACT_MESSAGE);
    assert.equal(deniedBody.al, 'AL3');
    assert.equal(createCalls, 0);

    const ok = await handleOAuthCallback(
      {
        body: JSON.stringify({
          provider: 'fixture_auth',
          code: 'fixture',
          profile: { subject: 'http-ok', email: 'u@example.com' },
          intent: 'partner',
        }),
      },
      'POST /auth/oauth/callback',
      {
        createIdentityRow: async () => {
          createCalls += 1;
          return { userId: 'TESTUSR2' };
        },
      },
    );
    assert.equal(ok.statusCode, 200);
    const okBody = JSON.parse(ok.body);
    assert.equal(okBody.ok, true);
    assert.equal(okBody.session.userId, 'TESTUSR2');
    assert.equal(createCalls, 1);
  });

  it('CDK + entry wire /auth/oauth/callback; FR-231 Decision LOCKED; AL3 mock copy', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    const entry = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-231.md'), 'utf8');
    const al3 = fs.readFileSync(
      path.join(ROOT, 'docs', 'mocks', 'components-piece-auth', 'error.html'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/auth\/oauth\/callback'/);
    assert.match(entry, /matchOAuthCallbackRoute|handleOAuthCallback/);
    assert.match(fr, /Decision\s*\(LOCKED\)|Status:\s*Decision LOCKED/i);
    assert.match(al3, /Provider returned no contact/);
  });
});
