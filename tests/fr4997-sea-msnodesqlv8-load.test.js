'use strict';

/**
 * FR #4997: a-sqlsearch SEA must load msnodesqlv8 via createRequire(execPath).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const {
  loadMssqlModule,
  isUnknownBuiltinModuleError,
} = require('../shared/mssql/loadMssql');
const {
  resolveMssqlRequirePath,
  mssqlConfigFromEnv,
  loadMssqlModule: loadFromQueryParts,
} = require('../providers/local/sql/src/queryParts');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('FR #4997 SEA msnodesqlv8 load', () => {
  it('shared loadMssql falls back to createRequire(execPath) on ERR_UNKNOWN_BUILTIN_MODULE', () => {
    const fake = { marker: 'beside-exe-fr4997' };
    let createCalls = 0;
    const err = Object.assign(new Error('No such built-in module: mssql/msnodesqlv8'), {
      code: 'ERR_UNKNOWN_BUILTIN_MODULE',
    });
    assert.equal(isUnknownBuiltinModuleError(err), true);

    const loaded = loadMssqlModule('mssql/msnodesqlv8', {
      execPath: path.join(os.tmpdir(), 'fake-a-sqlsearch.exe'),
      requireImpl: () => {
        throw err;
      },
      createRequireImpl: (filename) => {
        createCalls += 1;
        assert.match(filename, /fake-a-sqlsearch\.exe$/);
        return () => fake;
      },
    });
    assert.equal(loaded, fake);
    assert.equal(createCalls, 1);
  });

  it('forceBesideExe always uses createRequire(execPath)', () => {
    const fake = { ok: 1 };
    const loaded = loadMssqlModule('mssql/msnodesqlv8', {
      execPath: 'C:\\ai\\a-search\\dist\\sea\\a-sqlsearch.exe',
      forceBesideExe: true,
      createRequireImpl: (filename) => {
        assert.equal(filename, 'C:\\ai\\a-search\\dist\\sea\\a-sqlsearch.exe');
        return () => fake;
      },
    });
    assert.equal(loaded.ok, 1);
  });

  it('resolves a stub package beside a fake exe via createRequire', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4997-sea-'));
    const exePath = path.join(tmp, 'a-sqlsearch.exe');
    fs.writeFileSync(exePath, '', 'utf8');
    const pkgDir = path.join(tmp, 'node_modules', 'mssql');
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'mssql', version: '0.0.0-fake', main: 'index.js' }),
      'utf8',
    );
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = { pure: true };\n', 'utf8');
    fs.writeFileSync(
      path.join(pkgDir, 'msnodesqlv8.js'),
      "module.exports = { driver: 'msnodesqlv8', fromBesideExe: true };\n",
      'utf8',
    );

    const loaded = loadMssqlModule('mssql/msnodesqlv8', {
      execPath: exePath,
      forceBesideExe: true,
    });
    assert.equal(loaded.fromBesideExe, true);
    assert.equal(loaded.driver, 'msnodesqlv8');
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('queryParts loadMssqlModule wires shared helper for trusted config', () => {
    const cfg = mssqlConfigFromEnv({
      MSSQL_SERVER: 'walrus\\ASEARCH',
      MSSQL_DATABASE: 'a_search',
      MSSQL_TRUSTED_CONNECTION: 'true',
    });
    assert.equal(resolveMssqlRequirePath(cfg), 'mssql/msnodesqlv8');
    const fake = { NVarChar: 'x' };
    const loaded = loadFromQueryParts(cfg, {
      forceBesideExe: true,
      execPath: path.join(os.tmpdir(), 'a-sqlsearch.exe'),
      createRequireImpl: () => () => fake,
    });
    assert.equal(loaded, fake);
  });

  it('docs and register script keep legacy drain unless ReplaceLegacySqlDrain', () => {
    const docs = read('docs/a-annotator-a-sqlsearch.md');
    assert.match(docs, /createRequire\(process\.execPath\)/);
    assert.match(docs, /ERR_UNKNOWN_BUILTIN_MODULE/);
    assert.match(docs, /ReplaceLegacySqlDrain/);
    assert.match(docs, /smoke-a-sqlsearch-trusted-select/);

    const drainDocs = read('docs/walrus-sql-drain.md');
    assert.match(drainDocs, /ReplaceLegacySqlDrain/);
    assert.match(drainDocs, /createRequire\(process\.execPath\)/);

    const reg = read('walrus/install/Register-ASearchWalrusServices.ps1');
    assert.match(reg, /\$ReplaceLegacySqlDrain/);
    assert.match(reg, /Keeping \$LegacySqlService/);
    assert.match(
      reg,
      /if \(\$ReplaceLegacySqlDrain\)[\s\S]*Remove-NssmService[\s\S]*LegacySqlService/,
    );

    const loadSrc = read('shared/mssql/loadMssql.js');
    assert.match(loadSrc, /createRequire/);
    assert.match(loadSrc, /ERR_UNKNOWN_BUILTIN_MODULE/);
    assert.match(loadSrc, /isSea/);

    const smoke = read('scripts/smoke-a-sqlsearch-trusted-select.js');
    assert.match(smoke, /SELECT 1/);
    assert.match(smoke, /forceBesideExe:\s*true/);
  });

  it(
    'WhatIf keeps legacy sql drain by default',
    { skip: process.platform === 'win32' ? false : 'Windows PowerShell only' },
    () => {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4997-reg-'));
      const secret = path.join(tmp, 'sql.password');
      fs.writeFileSync(secret, 'FAKE_PASSWORD_NOT_A_SECRET\n', 'utf8');
      const script = path.join(
        ROOT,
        'walrus',
        'install',
        'Register-ASearchWalrusServices.ps1',
      );
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          script,
          '-WhatIf',
          '-InstallRoot',
          ROOT,
          '-FolderQueueUrl',
          'https://sqs.example/folders.fifo',
          '-ChangesQueueUrl',
          'https://sqs.example/changes',
          '-SqsDbBackedUrl',
          'https://sqs.example/db',
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
          '-MssqlServer',
          'walrus\\ASEARCH',
          '-MssqlDatabase',
          'a_search',
          '-MssqlUser',
          'drain_user',
          '-MssqlPasswordFile',
          secret,
          '-SearchApiUrl',
          'https://api.example/search',
          '-AgentApiKeyFile',
          'C:\\ai\\a-search\\secrets\\agent.key',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
      assert.match(r.stdout, /Keeping a-search-walrus-sql-drain/);
      assert.equal(/ReplaceLegacySqlDrain: removing/.test(r.stdout), false);
      assert.equal(r.stdout.includes('FAKE_PASSWORD_NOT_A_SECRET'), false);
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  );
});
