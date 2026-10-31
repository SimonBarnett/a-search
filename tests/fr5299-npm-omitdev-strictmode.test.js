'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEPLOY_PS1 = path.resolve(
  __dirname, '..', 'walrus', 'install', 'Deploy-WalrusSqlDrain.ps1',
);
const src = fs.readFileSync(DEPLOY_PS1, 'utf8');
const npmFunction = src.slice(
  src.indexOf('function Invoke-NpmOmitDev {'),
  src.indexOf('function Restart-DrainService {'),
);

function findPowerShell() {
  for (const command of ['pwsh', 'powershell.exe']) {
    const result = spawnSync(command, [
      '-NoProfile', '-NonInteractive', '-Command', '(Get-Process -Id $PID).Path',
    ], { encoding: 'utf8', timeout: 30000 });
    if (result.error && result.error.code === 'ENOENT') continue;
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  return null;
}

const powershell = findPowerShell();

function runNpm(t, mode) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'npm strictmode '));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const nodeDir = path.join(temp, 'node folder');
  const installRoot = path.join(temp, 'install folder');
  const emptyPath = path.join(temp, 'empty path');
  for (const dir of [nodeDir, installRoot, emptyPath]) {
    fs.mkdirSync(dir);
  }
  const log = path.join(temp, 'npm-args.txt');
  const stub = process.platform === 'win32'
    ? '@echo off\r\n> "%NPM_TEST_LOG%" echo %*\r\nexit /b 0\r\n'
    : '#!/bin/sh\nprintf "%s\\n" "$*" > "$NPM_TEST_LOG"\nexit 0\n';
  if (mode !== 'missing') {
    const name = mode === 'path' && process.platform !== 'win32' ? 'npm' : 'npm.cmd';
    fs.writeFileSync(path.join(nodeDir, name), stub, { mode: 0o755 });
  }
  const script = `
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile(
      $env:NPM_TEST_SCRIPT, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -ne 0) { throw 'deploy script parse failed' }
    $fn = $ast.Find({
      param($item)
      $item -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $item.Name -eq 'Invoke-NpmOmitDev'
    }, $true)
    . ([scriptblock]::Create($fn.Extent.Text))
    $env:PATH = $env:NPM_TEST_PATH
    if ($env:NPM_TEST_MODE -ne 'path' -and (Get-Command npm -ErrorAction SilentlyContinue)) {
      throw 'test PATH unexpectedly contains npm'
    }
    $before = (Get-Location).Path
    if ($env:NPM_TEST_MODE -eq 'missing') {
      try {
        Invoke-NpmOmitDev -InstallRoot $env:NPM_TEST_ROOT -NodePath $env:NPM_TEST_NODE
        throw 'expected missing npm to throw'
      } catch {
        if ($_.Exception.Message -ne 'npm not found on PATH') { throw }
      }
    } else {
      Invoke-NpmOmitDev -InstallRoot $env:NPM_TEST_ROOT -NodePath $env:NPM_TEST_NODE
    }
    if ((Get-Location).Path -ne $before) { throw 'working directory not restored' }
  `;
  const result = spawnSync(powershell, [
    '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(script, 'utf16le').toString('base64'),
  ], {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...process.env,
      NPM_TEST_SCRIPT: DEPLOY_PS1,
      NPM_TEST_MODE: mode,
      NPM_TEST_PATH: mode === 'path' ? nodeDir : emptyPath,
      NPM_TEST_ROOT: installRoot,
      NPM_TEST_NODE: path.join(nodeDir, 'node.exe'),
      NPM_TEST_LOG: log,
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);
  if (mode === 'missing') {
    assert.equal(fs.existsSync(log), false);
  } else {
    assert.equal(fs.readFileSync(log, 'utf8').trim(), 'install --omit=dev');
  }
}

describe('FR #5299 Invoke-NpmOmitDev under StrictMode', () => {
  it('resolves both branches to a path instead of reading Source from FileInfo', () => {
    assert.match(npmFunction, /\$npmExe\s*=\s*\$npmCmd\.Source/);
    assert.match(npmFunction, /\$npmExe\s*=\s*\$npmBeside/);
    assert.match(npmFunction, /&\s+\$npmExe\s+install\s+--omit=dev/);
    assert.doesNotMatch(npmFunction, /Get-Item|&\s+\$npmCmd\.Source/);
    assert.match(npmFunction, /throw 'npm not found on PATH'/);
  });

  for (const [mode, title] of [
    ['fallback', 'runs npm.cmd beside node when npm is absent from PATH'],
    ['path', 'still runs npm found on PATH'],
    ['missing', 'keeps the explicit error when neither npm location exists'],
  ]) {
    it(title, { skip: powershell ? false : 'PowerShell is not available' }, (t) => {
      runNpm(t, mode);
    });
  }
});
