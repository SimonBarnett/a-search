'use strict';

/**
 * FR #4240: LocalSystem + dedicated GROK_HOME (SYSTEM ACL) is the supported
 * reviewer mode. Installer must accept -GrokHome without admin password;
 * comments/docs must cite ACL Access denied, not DPAPI.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-AClubsQueueService.ps1');
const REVIEWERS = path.join(ROOT, 'redqueen', 'src', 'reviewers.js');
const DOCS = path.join(ROOT, 'docs', 'redqueen-annotations.md');

function windowsElevated() {
  if (process.platform !== 'win32') return false;
  const r = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)',
    ],
    { encoding: 'utf8', timeout: 20_000 },
  );
  return r.status === 0 && String(r.stdout || '').trim() === 'True';
}

describe('FR #4240 GrokHome LocalSystem reviewer mode', () => {
  it('script has GrokHome/ServiceHome and ACL language', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(src, /GrokHome/);
    assert.match(src, /ServiceHome/);
    assert.match(src, /GROK_HOME/);
    assert.match(src, /Access is denied|S-1-5-18|SYSTEM/i);
    assert.doesNotMatch(
      src,
      /sign-in is DPAPI-bound to the Windows user that ran grok login/i,
    );
  });

  it('reviewers.js and docs cite GROK_HOME / ACL', () => {
    const rev = fs.readFileSync(REVIEWERS, 'utf8');
    const doc = fs.readFileSync(DOCS, 'utf8');
    assert.match(rev, /GROK_HOME|Access is denied|ACL/i);
    assert.match(doc, /GrokHome|GROK_HOME/);
    assert.match(doc, /device-auth|LocalSystem/i);
    assert.doesNotMatch(doc, /grok sign-in is DPAPI-bound/i);
  });

  it(
    'WhatIf with GrokHome keeps LocalSystem and emits GROK_HOME',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4240-grok-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');
      const grokHome = path.join(tmp, 'grok-system-home');
      const logPath = path.join(tmp, 'nssm-args.log');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(
        fakeNssm,
        ['@echo off', `>> "${logPath}" echo %*`, 'exit /b 0', ''].join('\r\n'),
        'utf8',
      );
      const grokCli = path.join(tmp, 'grok.exe');
      fs.writeFileSync(grokCli, '', 'utf8');
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          'a-search-aclubs-queue-fr4240',
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-GrokCli',
          grokCli,
          '-GrokHome',
          grokHome,
          '-WhatIf',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      assert.equal(r.status, 0, text);
      assert.match(text, /GROK_HOME=/i);
      assert.match(text, /USERPROFILE=/i);
      assert.match(text, /HOME=/i);
      assert.match(text, /Logon:\s*LocalSystem/i);
      assert.match(text, /AWS_PROFILE=/i);
      assert.doesNotMatch(text, /reviewer_logon_required/);
      assert.match(text, /A_CLUBS_BUCKET=a-clubs/);
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch (_) {
        /* best-effort */
      }
    },
  );

  it(
    'GrokHome creates .grok dir and prints device-auth hint',
    {
      skip:
        process.platform !== 'win32'
          ? 'Windows only'
          : windowsElevated()
            ? false
            : 'Set-Acl SYSTEM ACE needs an elevated process',
    },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4240-acl-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');
      const grokHome = path.join(tmp, 'grok-system-home');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(fakeNssm, '@echo off\r\nexit /b 0\r\n', 'utf8');
      const grokCli = path.join(tmp, 'grok.exe');
      fs.writeFileSync(grokCli, '', 'utf8');
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          SCRIPT,
          '-InstallRoot',
          installRoot,
          '-ServiceName',
          'a-search-aclubs-queue-fr4240-acl',
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-GrokCli',
          grokCli,
          '-GrokHome',
          grokHome,
        ],
        { encoding: 'utf8', timeout: 90_000 },
      );
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      assert.equal(r.status, 0, text);
      assert.ok(fs.existsSync(path.join(grokHome, '.grok')), '.grok under GrokHome');
      assert.match(text, /GROK_HOME:/i);
      assert.match(text, /device-auth|auth\.json/i);
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch (_) {
        /* best-effort */
      }
    },
  );
});
