'use strict';

/**
 * FR #4827: SEA build pins, nssm installer, CDK queue, static provider map.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { LOCAL_WORKER_LOADERS } = require('../walrus/src/runJob');

const ROOT = path.join(__dirname, '..');

const LOCAL_IDS = [
  'admitad',
  'avantlink',
  'awin',
  'bigcommerce',
  'ecwid',
  'flexoffers',
  'impact',
  'magento',
  'partnerize',
  'shopify',
  'skimlinks',
  'sql',
  'squarespace',
  'tradedoubler',
  'webgains',
  'wix',
  'woocommerce',
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function parsePs1(rel) {
  const full = path.join(ROOT, rel);
  const script = [
    '$errs = $null',
    '$tokens = $null',
    "[void][System.Management.Automation.Language.Parser]::ParseFile('" + full.replace(/'/g, "''") + "', [ref]$tokens, [ref]$errs)",
    'if ($errs -and $errs.Count) { $errs | ForEach-Object { $_.ToString() }; exit 1 }',
    'exit 0',
  ].join('; ');
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8' },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

const winPs = process.platform === 'win32';

describe('FR #4827 SEA scripts and version', () => {
  it('build script uses esbuild, sea-config, postject, and downloads win node off Windows', () => {
    const src = read('scripts/build-a-search-sea.js');
    assert.match(src, /esbuild/);
    assert.match(src, /--experimental-sea-config/);
    assert.match(src, /postject/);
    assert.match(src, /a-annotator\.exe/);
    assert.match(src, /a-sqlsearch\.exe/);
    assert.match(src, /nodejs\.org\/dist/);
    assert.match(src, /win-x64\/node\.exe/);
    assert.match(src, /--smoke/);
    assert.match(src, /--version/);
    assert.match(src, /max-old-space-size=4096/);
    const pkg = JSON.parse(read('package.json'));
    assert.equal(pkg.scripts['build:sea'], 'node scripts/build-a-search-sea.js');
    assert.ok(pkg.devDependencies.esbuild, 'esbuild devDependency');
    assert.ok(pkg.devDependencies.postject, 'postject devDependency');
  });

  it('--version exits 0 for annotator and sqlsearch entries', () => {
    const cases = [
      ['redqueen/src/run.js', /a-annotator 0\.1\.0/],
      ['walrus/src/index.js', /a-sqlsearch 0\.1\.0/],
      ['scripts/sea/annotator-entry.js', /a-annotator 0\.1\.0/],
      ['scripts/sea/sqlsearch-entry.js', /a-sqlsearch 0\.1\.0/],
    ];
    for (const [rel, re] of cases) {
      const r = spawnSync(process.execPath, [path.join(ROOT, rel), '--version'], {
        encoding: 'utf8',
        cwd: ROOT,
      });
      assert.equal(r.status, 0, `${rel} ${r.stderr}`);
      assert.match(r.stdout, re);
    }
  });

  it('CI job build-sea uploads both exes and runs --version smoke', () => {
    const yml = read('.github/workflows/ci.yml');
    assert.match(yml, /build-sea:/);
    assert.match(yml, /node scripts\/build-a-search-sea\.js --smoke/);
    assert.match(yml, /annotator-entry\.js --version/);
    assert.match(yml, /sqlsearch-entry\.js --version/);
    assert.match(yml, /a-annotator\.exe/);
    assert.match(yml, /a-sqlsearch\.exe/);
    assert.match(yml, /upload-artifact@v4/);
  });
});

describe('FR #4827 register script', () => {
  const rel = 'walrus/install/Register-ASearchWalrusServices.ps1';

  it('parses on Windows PowerShell 5.1 and names both services', () => {
    if (winPs) {
      parsePs1(rel);
      parsePs1('scripts/Enable-AClubsEventBridge.ps1');
    }
    const src = read(rel);
    assert.match(src, /#Requires -Version 5\.1/);
    assert.match(src, /a-annotator/);
    assert.match(src, /a-sqlsearch/);
    assert.match(src, /a-search-walrus-sql-drain/);
    assert.match(src, /SERVICE_AUTO_START/);
    assert.match(src, /AppRotateFiles/);
    assert.match(src, /AppExit/);
    assert.match(src, /Unregister/);
    assert.match(src, /nssm/);
    assert.match(src, /madeiradb/);
    assert.equal(src.includes('??'), false);
    const legacyAnn = read('redqueen/install/Register-AClubsQueueService.ps1');
    const legacySql = read('walrus/install/Register-WalrusSqlDrainService.ps1');
    assert.match(legacyAnn, /Register-ASearchWalrusServices\.ps1/);
    assert.match(legacyAnn, /a-annotator/);
    assert.match(legacySql, /a-sqlsearch/);
    assert.match(legacySql, /Register-ASearchWalrusServices\.ps1/);
  });

  it(
    'WhatIf masks secrets and removes the legacy sql drain',
    { skip: winPs ? false : 'Windows PowerShell only (CI is Linux)' },
    () => {
    const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fr4827-'));
    const secret = path.join(tmp, 'sql.password');
    fs.writeFileSync(secret, 'FAKE_PASSWORD_NOT_A_SECRET\n', 'utf8');
    const script = path.join(ROOT, rel);
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
    const out = r.stdout;
    assert.match(out, /a-annotator/);
    assert.match(out, /a-sqlsearch/);
    assert.match(out, /SERVICE_AUTO_START/);
    assert.match(out, /AppRotateFiles/);
    assert.match(out, /a-search-walrus-sql-drain/);
    assert.match(out, /MSSQL_PASSWORD=\*\*\*/);
    assert.equal(out.includes('FAKE_PASSWORD_NOT_A_SECRET'), false);
    fs.rmSync(tmp, { recursive: true, force: true });
    },
  );
});

describe('FR #4827 CDK pins', () => {
  it('parts-gateway-stack declares a-clubs-changes, consume, CopyObject, and suffix rules', () => {
    const src = read('cdk/lib/parts-gateway-stack.js');
    assert.match(src, /a-clubs-changes/);
    assert.match(src, /a-clubs-changes-dlq/);
    assert.match(src, /changesQueue\.grantConsumeMessages\(redqueenUser\)/);
    assert.match(src, /s3:CopyObject/);
    assert.match(src, /widget\.json/);
    assert.match(src, /searches\.json/);
    assert.match(src, /SqsQueue/);
    assert.match(src, /AClubsChangesQueueUrl/);
    assert.match(src, /AClubsChangesDlqUrl/);
    assert.match(src, /Object Created/);
  });
});

describe('FR #4827 static local provider map', () => {
  it('lists all 17 providers as literal requires', () => {
    const src = read('walrus/src/runJob.js');
    assert.equal(/require\(localWorkerPath\(/.test(src), false);
    assert.equal(Object.keys(LOCAL_WORKER_LOADERS).length, 17);
    for (const id of LOCAL_IDS) {
      assert.match(src, new RegExp(`require\\('\\.\\./\\.\\./providers/local/${id}/src/worker'\\)`));
      assert.equal(typeof LOCAL_WORKER_LOADERS[id], 'function');
    }
    const worker = LOCAL_WORKER_LOADERS.sql();
    assert.equal(typeof worker.run, 'function');
  });
});
