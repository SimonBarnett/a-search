'use strict';

/**
 * MRB #2073 docs/hostile: FR-231 OAuth contact reject fail-closed.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  clearAuthAdapters,
  registerAuthAdapter,
} = require('../shared/auth/registry');
const { createFixtureAdapter } = require('../shared/auth/adapters/fixture');
const {
  OAUTH_NO_CONTACT_CODE,
  OAUTH_NO_CONTACT_MESSAGE,
  completeOAuthLogin,
} = require('../shared/auth/oauthCallback');

describe('MRB #2073 hostile FR-231 oauth contact reject', () => {
  beforeEach(() => {
    clearAuthAdapters();
    registerAuthAdapter('fixture_auth', createFixtureAdapter('fixture_auth'));
  });
  afterEach(() => {
    clearAuthAdapters();
  });

  it('Decision LOCKED; AL3 reject; createIdentity never called; CDK+entry wired', async () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-231.md'), 'utf8');
    assert.match(fr, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(fr, /createIdentityRow/);
    assert.match(fr, /\/auth\/oauth\/callback/);

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
          return { userId: 'X' };
        },
      },
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, OAUTH_NO_CONTACT_CODE);
    assert.equal(result.message, OAUTH_NO_CONTACT_MESSAGE);
    assert.equal(result.al, 'AL3');
    assert.equal(createCalls, 0);

    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/auth\/oauth\/callback'/);

    const index = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(index, /handleOAuthCallback/);
    assert.match(index, /matchOAuthCallbackRoute/);

    const mock = fs.readFileSync(
      path.join(ROOT, 'docs', 'mocks', 'components-piece-auth', 'error.html'),
      'utf8',
    );
    assert.match(mock, /Provider returned no contact/);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(pkg.files.includes('auth/'));
  });
});