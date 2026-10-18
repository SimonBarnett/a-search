'use strict';

/**
 * docs/mrb-4244 hostile: live -GrokHome Set-Acl is skipped unless the
 * process is Administrator; WhatIf still runs; ACL is SYSTEM + Admins
 * with inheritance removed (FR #4240).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEST = path.join(ROOT, 'tests', 'fr4240-grok-home-localsystem.test.js');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-AClubsQueueService.ps1');

describe('MRB #4244 hostile FR #4240 elevated Set-Acl skip', () => {
  it('live Set-Acl test skips unless Administrator; WhatIf does not', () => {
    const src = fs.readFileSync(TEST, 'utf8');
    assert.match(src, /Set-Acl SYSTEM ACE needs an elevated process/);
    assert.match(src, /windowsElevated\(\)/);
    const whatIf = src.slice(src.indexOf('WhatIf with GrokHome'));
    assert.match(whatIf, /skip: process\.platform !== 'win32'/);
    assert.doesNotMatch(
      whatIf.slice(0, 400),
      /windowsElevated/,
    );
  });

  it('GrokHome ACL is SYSTEM and Administrators with inheritance removed', () => {
    const ps = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(ps, /S-1-5-18/);
    assert.match(ps, /S-1-5-32-544/);
    assert.match(ps, /SetAccessRuleProtection\(\$true,\s*\$false\)/);
    assert.match(ps, /\[DryRun\] ensure GrokHome ACL/);
  });
});
