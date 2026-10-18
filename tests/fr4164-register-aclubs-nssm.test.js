'use strict';

/**
 * FR #4164: Register-AClubsQueueService.ps1 must pass real nssm args (not $Args)
 * and treat exit 0 as success. Exercises the install path with a fake nssm stub.
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

describe('FR #4164 Register-AClubsQueueService nssm args', () => {
  it('source renames $Args, returns exit code only, supports USERPROFILE/HOME', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(src, /\$NssmArgs/);
    assert.doesNotMatch(src, /param\(\[string\]\$Nssm,\s*\[string\[\]\$Args\)/);
    assert.doesNotMatch(src, /-Args\s+@/);
    assert.match(src, /Out-Host/);
    assert.match(src, /UserProfile/);
    assert.match(src, /HomePath/);
    assert.match(src, /Logon:/);
    assert.match(src, /Out-Null/);
  });

  it(
    'fake nssm receives install/set args and exit 0 succeeds',
    { skip: process.platform !== 'win32' ? 'Windows only' : false },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4164-nssm-'));
      const installRoot = path.join(tmp, 'install');
      const runJs = path.join(installRoot, 'redqueen', 'src', 'run.js');
      fs.mkdirSync(path.dirname(runJs), { recursive: true });
      fs.writeFileSync(runJs, '// stub\n', 'utf8');

      const logPath = path.join(tmp, 'nssm-args.log');
      const fakeNssm = path.join(tmp, 'fake-nssm.cmd');
      // Record each invocation's args; always exit 0.
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

      const svc = 'a-search-aclubs-queue-fr4164-test';
      const userProfile = path.join(tmp, 'AdminProfile');
      const homePath = path.join(tmp, 'AdminHome');
      const nodeExe = process.execPath;
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
          svc,
          '-NodeExe',
          nodeExe,
          '-NssmExe',
          fakeNssm,
          '-UserProfile',
          userProfile,
          '-HomePath',
          homePath,
          '-GrokCli',
          grokCli,
          // FR #4231: LocalSystem + GrokCli is refused unless tests opt in.
          '-AllowLocalSystem',
        ],
        { encoding: 'utf8', timeout: 60_000 },
      );
      assert.equal(r.status, 0, `stderr=${r.stderr}\nstdout=${r.stdout}`);
      assert.match(r.stdout || '', /Logon:\s*LocalSystem/);
      assert.match(r.stdout || '', /USERPROFILE:/);

      assert.ok(fs.existsSync(logPath), 'fake nssm should have logged args');
      const log = fs.readFileSync(logPath, 'utf8');
      assert.match(log, new RegExp(`install\\s+${svc}\\s+`, 'i'));
      assert.match(log, new RegExp(`set\\s+${svc}\\s+Application`, 'i'));
      assert.match(log, /AppEnvironmentExtra/);
      assert.match(log, /USERPROFILE=/);
      assert.match(log, /HOME=/);
      assert.match(log, /GROK_CLI=/);
      assert.match(log, /AWS_PROFILE=a-search-redqueen-annotator/);

      // Cleanup temp only (never touched a real service name).
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    },
  );
});
