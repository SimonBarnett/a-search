'use strict';

/**
 * MRB #5073 hostile pins for FR #5066 CJ invite.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('MRB #5073 hostile FR #5066', () => {
  it('invite.ps1 registers cj + awin; exit 5 for inactive account', () => {
    const src = fs.readFileSync(path.join(ROOT, 'tools', 'invite.ps1'), 'utf8');
    assert.match(src, /InviteProviders = @\('awin', 'rakuten', 'cj'\)/);
    assert.match(src, /cj_account_not_active/);
    assert.match(src, /Exit 5/);
    assert.match(src, /Invoke-CjInvite|provider=cj|'cj'/);
  });

  it('seed cj invite notes keep enabled=0 until #5057', () => {
    const cfg = fs.readFileSync(
      path.join(
        ROOT,
        'redqueen',
        'affiliate-agent',
        'seed',
        'a-affiliates',
        'cj',
        '_invite',
        'config.json',
      ),
      'utf8',
    );
    assert.match(cfg, /enabled=0/);
    assert.match(cfg, /#5057/);
  });

  it('lookup 403 maps to cj_account_not_active without token literals', async () => {
    const lookup = path.join(
      ROOT,
      'redqueen',
      'cj-invite',
      'lib',
      'advertiserLookup.js',
    );
    const src = fs.readFileSync(lookup, 'utf8');
    assert.match(src, /cj_account_not_active/);
    assert.match(src, /403/);
    assert.doesNotMatch(src, /Bearer [A-Za-z0-9\-_]{20,}/);
  });
});
