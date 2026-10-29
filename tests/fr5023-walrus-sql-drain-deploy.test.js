'use strict';

/**
 * FR #5023 / fix(mrb-5035): walrus SQL drain deploy manifest (shared pageSelect);
 * load-check + Deploy-WalrusSqlDrain.ps1 + docs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(
  ROOT,
  'walrus',
  'install',
  'walrus-sql-drain-deploy-manifest.json',
);
const ASSERT_JS = path.join(
  ROOT,
  'walrus',
  'install',
  'assert-walrus-sql-drain-graph.js',
);
const DEPLOY_PS1 = path.join(
  ROOT,
  'walrus',
  'install',
  'Deploy-WalrusSqlDrain.ps1',
);
const DOCS = path.join(ROOT, 'docs', 'walrus-sql-drain.md');

describe('FR #5023 walrus SQL drain deploy manifest', () => {
  it('lists shared and other required folders/files; no redqueen/src', () => {
    assert.equal(fs.existsSync(MANIFEST), true, 'manifest exists');
    const raw = fs.readFileSync(MANIFEST, 'utf8');
    assert.equal(raw.charCodeAt(0) === 0xfeff, false, 'manifest has no BOM');
    const obj = JSON.parse(raw);
    assert.ok(Array.isArray(obj.paths), 'paths array');
    const paths = obj.paths.map(String);
    for (const need of [
      'walrus/src',
      'providers',
      'shared',
      'worker',
      'package.json',
      'package-lock.json',
      'VERSION',
    ]) {
      assert.ok(paths.includes(need), `manifest includes ${need}`);
    }
    assert.equal(paths.includes('redqueen/src'), false);
    assert.match(String(obj.note || ''), /#5022|shared\/widgets/);
  });
});

describe('FR #5023 assert-walrus-sql-drain-graph.js', () => {
  it('exists and asserts shared pageSelect / searchDone (FR #5270)', () => {
    assert.equal(fs.existsSync(ASSERT_JS), true);
    const src = fs.readFileSync(ASSERT_JS, 'utf8');
    assert.equal(src.charCodeAt(0) === 0xfeff, false, 'assert js has no BOM');
    assert.match(src, /shared['\\/]+widgets['\\/]+pageSelect/);
    assert.match(src, /searchDone/);
    assert.doesNotMatch(src, /promoteInToLive/);
    assert.match(src, /index\.js/);
    assert.match(src, /MODULE_NOT_FOUND/);
    assert.doesNotMatch(src, /redqueen['\\/]+src['\\/]+pageSelect/);
  });

  it('passes when run from repo root with node', () => {
    const node = process.execPath;
    const r = spawnSync(node, [ASSERT_JS], {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.equal(
      r.status,
      0,
      `assert exit ${r.status} stderr=${r.stderr} stdout=${r.stdout}`,
    );
    assert.match(String(r.stdout || ''), /ok/);
  });
});

describe('FR #5023 Deploy-WalrusSqlDrain.ps1', () => {
  it('mentions backup, exclude aws, npm install --omit=dev, rollback, load check', () => {
    assert.equal(fs.existsSync(DEPLOY_PS1), true);
    const src = fs.readFileSync(DEPLOY_PS1, 'utf8');
    assert.equal(src.charCodeAt(0) === 0xfeff, false, 'deploy ps1 has no BOM');
    assert.match(src, /\.deploy-backup/);
    assert.match(src, /walrus\\aws|walrus\\\\aws/);
    assert.match(src, /npm install --omit=dev/);
    assert.match(src, /[Rr]ollback|Restore-FromBackup/);
    assert.match(src, /assert-walrus-sql-drain-graph|Load check|Invoke-LoadCheck/);
    assert.match(src, /WhatIf/);
    assert.match(src, /SkipService|Restart-DrainService/);
  });

  it('uses the npm.cmd fallback path without reading Source from Get-Item', () => {
    const src = fs.readFileSync(DEPLOY_PS1, 'utf8');
    assert.match(src, /\$npmPath = \$npmBeside/);
    assert.match(src, /& \$npmPath install --omit=dev/);
    assert.doesNotMatch(src, /\$npmCmd\.Source/);
  });
});

describe('FR #5023 docs/walrus-sql-drain.md', () => {
  it('mentions Deploy-WalrusSqlDrain and shared pageSelect (no redqueen deploy)', () => {
    const src = fs.readFileSync(DOCS, 'utf8');
    assert.match(src, /Deploy-WalrusSqlDrain/);
    assert.match(src, /shared\/widgets\/pageSelect/);
    assert.match(src, /#5022/);
    assert.match(src, /a-sqlsearch\.exe|#4997/);
    assert.match(src, /do \*\*not\*\*[\s\S]*redqueen\/src|Do not copy redqueen\/src/i);
  });
});
