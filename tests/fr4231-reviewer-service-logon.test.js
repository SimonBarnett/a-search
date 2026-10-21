'use strict';

/**
 * FR #4231 / #4240: Admin ~/.grok is not usable as LocalSystem (ACL Access
 * denied). Prefer -GrokHome; -Credential / service.password remain alternatives.
 * reviewers.js must not claim Credential is optional when only USERPROFILE is set.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(
  ROOT,
  'redqueen',
  'install',
  'Register-AClubsQueueService.ps1',
);
const REVIEWERS = path.join(ROOT, 'redqueen', 'src', 'reviewers.js');
const DOCS = path.join(ROOT, 'docs', 'redqueen-annotations.md');

describe('FR #4231 reviewer service logon', () => {
  it('reviewers.js does not claim USERPROFILE makes Credential unnecessary', () => {
    const src = fs.readFileSync(REVIEWERS, 'utf8');
    assert.doesNotMatch(
      src,
      /Credential is\s+not required/i,
      'remove the FR #4224 misleading comment',
    );
    assert.match(src, /GROK_HOME|Access is denied|LocalSystem|ACL/i);
  });

  it('docs require GrokHome or Credential; USERPROFILE alone insufficient', () => {
    const doc = fs.readFileSync(DOCS, 'utf8');
    assert.match(doc, /GrokHome|GROK_HOME/i);
    assert.match(doc, /service\.password|Credential/i);
    assert.match(doc, /Access is denied|device-auth|LocalSystem/i);
    assert.doesNotMatch(
      doc,
      /UserProfile.*sufficient|USERPROFILE alone is enough/i,
    );
  });

  it('Register script gates LocalSystem without GrokHome/Credential', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(src, /AllowLocalSystem/);
    assert.match(src, /GrokHome|ServiceHome/);
    assert.match(src, /ServicePasswordFile|service\.password/);
    assert.match(src, /reviewer_logon_required|Access is denied/i);
    assert.match(src, /ObjectName/);
  });
  it(
    'password file sets ObjectName without echoing the password',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4231-nssm-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');
      const cfg = path.join(installRoot, 'redqueen', 'config');
      fs.mkdirSync(cfg, { recursive: true });
      const pwFile = path.join(cfg, 'service.password');
      const secret = 'FAKE_svc_pw_fr4231_do_not_use';
      fs.writeFileSync(pwFile, `${secret}\n`, 'utf8');

      const logPath = path.join(tmp, 'nssm-args.log');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(
        fakeNssm,
        [
          '@echo off',
          `>> "${logPath}" echo %*`,
          'exit /b 0',
          '',
        ].join('\r\n'),
        'utf8',
      );

      const svc = 'a-search-aclubs-queue-fr4231-test';
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
          svc,
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-ServiceUser',
          '.\\Administrator',
          '-ServicePasswordFile',
          pwFile,
          '-GrokCli',
          path.join(tmp, 'grok.exe'),
          // FR #4794 / #4311: SearchApiUrl required unless -AllowLocalSystem
          '-SearchApiUrl',
          'https://example.test/a-search',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(r.stdout || '', /Logon:\s*Credential/i);
      assert.equal(
        (r.stdout || '').includes(secret),
        false,
        'password must never appear in installer stdout',
      );
      assert.equal(
        (r.stderr || '').includes(secret),
        false,
        'password must never appear in installer stderr',
      );

      const log = fs.readFileSync(logPath, 'utf8');
      assert.match(log, new RegExp(`ObjectName\\s+${svc}|set\\s+${svc}\\s+ObjectName`, 'i'));
      assert.match(log, /Administrator/i);

      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  );

  it(
    'refuses LocalSystem install when GrokCli set without AllowLocalSystem',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4231-deny-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      fs.writeFileSync(fakeNssm, '@echo off\nexit /b 0\n', 'utf8');
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
          'a-search-aclubs-queue-fr4231-deny',
          '-NodeExe',
          process.execPath,
          '-NssmExe',
          fakeNssm,
          '-GrokCli',
          grokCli,
          '-UserProfile',
          path.join(tmp, 'AdminProfile'),
          '-HomePath',
          path.join(tmp, 'AdminHome'),
          // FR #4794: clear search_api_url_required so reviewer_logon_required is reached
          '-SearchApiUrl',
          'https://example.test/a-search',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.notEqual(r.status, 0, 'must refuse LocalSystem + GrokCli');
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      assert.match(text, /reviewer_logon_required|DPAPI|AllowLocalSystem/i);
      assert.doesNotMatch(text, /search_api_url_required/);

      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  );

  it('cursor .cmd spawn uses shell (agent.cmd)', () => {
    const src = fs.readFileSync(REVIEWERS, 'utf8');
    assert.match(src, /\.cmd|shell:\s*true|ComSpec/i);
  });
});
