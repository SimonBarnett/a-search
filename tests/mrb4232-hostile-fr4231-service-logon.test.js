'use strict';

/**
 * docs/mrb-4232 hostile: FR #4231 LocalSystem cannot use Admin grok ACL;
 * installer requires Credential/service.password; secrets never echoed;
 * gitignore covers service.password; Cursor .cmd uses shell.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-AClubsQueueService.ps1');
const REVIEWERS = path.join(ROOT, 'redqueen', 'src', 'reviewers.js');
const DOCS = path.join(ROOT, 'docs', 'redqueen-annotations.md');
const GITIGNORE = path.join(ROOT, '.gitignore');

describe('MRB #4232 hostile FR #4231 service logon', () => {
  it('gitignore ignores service.password paths', () => {
    const g = fs.readFileSync(GITIGNORE, 'utf8');
    assert.match(g, /service\.password/);
    assert.match(g, /redqueen\/config\/service\.password|\*\*\/service\.password/);
  });

  it('installer gate and ACL docs are contiguous', () => {
    const ps = fs.readFileSync(SCRIPT, 'utf8');
    const doc = fs.readFileSync(DOCS, 'utf8');
    const rev = fs.readFileSync(REVIEWERS, 'utf8');
    assert.match(ps, /AllowLocalSystem/);
    assert.match(ps, /reviewer_logon_required/);
    assert.match(ps, /ServicePasswordFile/);
    assert.match(ps, /ObjectName/);
    assert.match(doc, /ACL|Not signed in/i);
    assert.match(rev, /ACL/);
    assert.doesNotMatch(rev, /Credential is\s+not required/i);
    assert.match(rev, /shell:\s*useShell|shell:\s*true/);
  });

  it('tip tests use FAKE_ password placeholder only', () => {
    const t = fs.readFileSync(
      path.join(__dirname, 'fr4231-reviewer-service-logon.test.js'),
      'utf8',
    );
    assert.match(t, /FAKE_svc_pw_fr4231/);
    assert.doesNotMatch(t, /password\s*=\s*['"][^'"]{12,}['"]/i);
  });
});

