'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

describe('MRB #5207 hostile: FR #5206 awin invite agent-root playwright', () => {
  it('invite.ps1 forces awin runFromAgentRoot scripts/invite.mjs', () => {
    const t = fs.readFileSync(path.join(ROOT, 'tools', 'invite.ps1'), 'utf8');
    assert.match(t, /function Test-InviteCfgValue/);
    assert.match(t, /FR #5206/);
    assert.match(t, /scripts\/invite\.mjs/);
    assert.match(t, /\$runFromAgent = \$true/);
    assert.doesNotMatch(t, /if \(\$cfg -and \$cfg\.reportDir\)/);
  });

  it('awin-agent invite.mjs is Playwright entry not invite_moved stub', () => {
    const t = fs.readFileSync(
      path.join(ROOT, 'redqueen', 'awin-agent', 'scripts', 'invite.mjs'),
      'utf8'
    );
    assert.match(t, /from 'playwright'/);
    assert.doesNotMatch(t, /invite_moved:/);
    assert.match(t, /AWIN_AFFILIATES_ROOT|AFFILIATES_ROOT/);
  });
});