'use strict';

/**
 * MRB #5067 / FR #5065: hostile pins --- Rakuten invite backend.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #5067 hostile FR #5065 rakuten invite', () => {
  it('invite.ps1 registers rakuten beside awin', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'invite.ps1'), 'utf8');
    assert.match(src, /InviteProviders\s*=\s*@\(\s*'awin'\s*,\s*'rakuten'\s*\)/);
    assert.match(src, /Invoke-RakutenInvite/);
  });

  it('rakutenInvite redacts secrets and uses Advertisers/Partnerships URLs', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'redqueen', 'invite', 'rakutenInvite.js'),
      'utf8',
    );
    assert.match(src, /api\.linksynergy\.com\/v2\/advertisers/);
    assert.match(src, /api\.linksynergy\.com\/v1\/partnerships/);
    assert.match(src, /function redactSecrets/);
    assert.match(src, /No password temp file/);
  });

  it('agent.ps1 sets RAKUTEN_USE_INVITE=1', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'agent.ps1'), 'utf8');
    assert.match(src, /RAKUTEN_USE_INVITE\s*=\s*'1'/);
  });
});
