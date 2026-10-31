'use strict';

/**
 * FR #5305: Register-HasresultsMonitorService defaults AWS credential file paths
 * for LocalSystem (same convention as a-search-aclubs-queue / Administrator .aws).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-HasresultsMonitorService.ps1');

describe('FR #5305 hasresults monitor AWS credential defaults', () => {
  it('register script documents FR #5305 AWS shared credentials defaults', () => {
    const reg = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(reg, /FR #5305/);
    assert.match(reg, /AWS_SHARED_CREDENTIALS_FILE/);
    assert.match(reg, /AWS_CONFIG_FILE/);
    assert.match(reg, /Administrator/);
    assert.match(reg, /\.aws/);
    assert.equal(reg.includes('\u2014'), false, 'no em-dash');
  });

  it(
    'WhatIf bare register includes AWS_SHARED_CREDENTIALS_FILE default',
    { skip: process.platform === 'win32' ? false : 'Windows only' },
    () => {
      const env = { ...process.env };
      delete env.AWS_SHARED_CREDENTIALS_FILE;
      delete env.AWS_CONFIG_FILE;
      const r = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          SCRIPT,
          '-WhatIf',
          '-InstallRoot',
          ROOT,
          '-AClubsRoot',
          'D:\\s3\\a-clubs',
        ],
        { encoding: 'utf8', env },
      );
      assert.equal(r.status, 0, r.stdout + '\n' + r.stderr);
      assert.match(r.stdout, /AWS_SHARED_CREDENTIALS_FILE=/);
      assert.match(r.stdout, /AWS_CONFIG_FILE=/);
      assert.match(r.stdout, /Administrator/);
      assert.match(r.stdout, /\.aws\\credentials|\.aws\/credentials/);
      assert.match(r.stdout, /\.aws\\config|\.aws\/config/);
    },
  );

  it('docs mention LocalSystem AWS credential file defaults', () => {
    const docs = fs.readFileSync(path.join(ROOT, 'docs', 'a-annotator-a-sqlsearch.md'), 'utf8');
    assert.match(docs, /a-hasresults-monitor/);
    assert.match(docs, /AWS_SHARED_CREDENTIALS_FILE/);
    assert.match(docs, /5305/);
  });
});
