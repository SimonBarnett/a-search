'use strict';

/**
 * MRB #5032 / fix(mrb-5035) hostile pins for FR #5023 walrus SQL drain deploy
 * after FR #5022 moved pageSelect into shared.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
const PROMOTE = path.join(ROOT, 'shared', 'widgets', 'promoteInToLive.js');

describe('MRB #5032 hostile FR #5023 (fix mrb-5035)', () => {
  it('manifest paths include shared; omit redqueen/src and secrets', () => {
    const obj = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const paths = obj.paths.map(String);
    assert.equal(paths.includes('redqueen/src'), false);
    assert.ok(paths.includes('shared'));
    assert.ok(paths.includes('walrus/src'));
    for (const p of paths) {
      assert.doesNotMatch(p, /walrus\/aws/i);
      assert.doesNotMatch(p, /\.password$/i);
    }
  });

  it('promoteInToLive requires shared ./pageSelect (FR #5022)', () => {
    const src = fs.readFileSync(PROMOTE, 'utf8');
    assert.match(src, /require\(['"]\.\/pageSelect['"]\)/);
    assert.doesNotMatch(src, /redqueen\/src\/pageSelect/);
  });

  it('assert graph requires shared pageSelect and exits 1 on MODULE_NOT_FOUND', () => {
    const src = fs.readFileSync(ASSERT_JS, 'utf8');
    assert.match(src, /shared['\\/]+widgets['\\/]+pageSelect/);
    assert.doesNotMatch(src, /redqueen['\\/]+src['\\/]+pageSelect/);
    assert.match(src, /MODULE_NOT_FOUND/);
    assert.match(src, /process\.exit\(1\)/);
    assert.match(src, /promoteInToLive/);
  });

  it('deploy script load-checks before Restart-DrainService and rolls back', () => {
    const src = fs.readFileSync(DEPLOY_PS1, 'utf8');
    const loadAt = src.indexOf('Invoke-LoadCheck');
    const restartAt = src.indexOf(
      'Restart-DrainService -ServiceName $ServiceName -Force:$Force -SkipService:$SkipService',
    );
    assert.ok(loadAt > 0, 'Invoke-LoadCheck present');
    assert.ok(restartAt > loadAt, 'load check before live restart');
    assert.match(src, /Restore-FromBackup/);
    assert.match(src, /Test-IsSecretOrAwsPath/);
    assert.match(src, /npm install --omit=dev/);
    assert.match(src, /\.deploy-backup/);
    assert.doesNotMatch(src, /password\s*=\s*['\"][^'\"]{8,}/i);
  });

  it('docs pin Deploy-WalrusSqlDrain, shared pageSelect, and a-sqlsearch.exe', () => {
    const src = fs.readFileSync(DOCS, 'utf8');
    assert.equal(src.charCodeAt(0) === 0xfeff, false);
    assert.match(src, /FR #5023/);
    assert.match(src, /Deploy-WalrusSqlDrain/);
    assert.match(src, /shared\/widgets\/pageSelect/);
    assert.match(src, /a-sqlsearch\.exe/);
    assert.match(src, /Load check before service restart/);
  });
});
