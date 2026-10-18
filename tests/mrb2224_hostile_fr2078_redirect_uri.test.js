'use strict';

/**
 * MRB #2224 hostile: extension login redirect_uri allowlist + claim club gate.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  isAllowedExtensionRedirectUri,
  isClubRole,
} = require('../shared/extension/webAuthFlow');

describe('MRB #2224 hostile FR-2078 redirect_uri + claim gate', () => {
  it('allows only chromiumapp.org https and chrome-extension', () => {
    assert.equal(
      isAllowedExtensionRedirectUri('https://abc.chromiumapp.org/'),
      true,
    );
    assert.equal(
      isAllowedExtensionRedirectUri('https://evil.com/?q=chromiumapp.org'),
      false,
    );
    assert.equal(isAllowedExtensionRedirectUri('javascript:alert(1)'), false);
    assert.equal(isClubRole({ role: 'club' }), true);
    assert.equal(isClubRole({ intent: 'partner' }), false);
  });

  it('login page and background enforce allowlist / club claim', () => {
    const login = fs.readFileSync(
      path.join(ROOT, 'components-piece', 'login', 'index.html'),
      'utf8',
    );
    assert.match(login, /isAllowedExtensionRedirectUri/);
    // Source uses a RegExp literal: /\.chromiumapp\.org$/i
    assert.match(login, /chromiumapp\\\.org/);
    // Gate must precede assign (open-redirect fix for MRB #2224).
    assert.match(
      login,
      /isAllowedExtensionRedirectUri\(redirectUri\)[\s\S]*location\.assign\(dest\)/,
    );
    const bg = fs.readFileSync(
      path.join(ROOT, 'extension', 'background.js'),
      'utf8',
    );
    assert.match(bg, /forbidden_not_club/);
    assert.match(bg, /msg\.type === 'claim'/);
  });
});
