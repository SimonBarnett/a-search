'use strict';

/** MRB #5306 hostile pins for FR #5305 AWS credential defaults. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'redqueen', 'install', 'Register-HasresultsMonitorService.ps1');

describe('MRB #5306 hostile hasresults AWS defaults', () => {
  it('bare register always AppEnvironmentExtra both AWS file env keys', () => {
    const reg = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(reg, /FR #5305/);
    assert.match(reg, /\[void\]\$envPairs\.Add\("AWS_SHARED_CREDENTIALS_FILE=/);
    assert.match(reg, /\[void\]\$envPairs\.Add\("AWS_CONFIG_FILE=/);
    assert.match(reg, /Users\\Administrator\\.aws\\credentials/);
    assert.equal(reg.includes('password'), false);
  });

  it('docs pin LocalSystem shared credentials for hasresults', () => {
    const docs = fs.readFileSync(path.join(ROOT, 'docs', 'a-annotator-a-sqlsearch.md'), 'utf8');
    assert.match(docs, /5305/);
    assert.match(docs, /AWS_SHARED_CREDENTIALS_FILE/);
    assert.match(docs, /LocalSystem/);
  });
});
