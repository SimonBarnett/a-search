'use strict';

/**
 * MRB #5179 hostile pin for FR #5176 invite/onboard/dbimport --profile.
 * Refs SimonBarnett/a-search#5179 / #5176 / #5174.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tools = path.join(root, 'tools');

function readTool(name) {
  return fs.readFileSync(path.join(tools, name), 'utf8');
}

describe('MRB #5179 hostile: invite/onboard/dbimport --profile', () => {
  it('invite list-objects-v2 argv includes --profile via Resolve-FolderS3CliProfile', () => {
    const src = readTool('invite.ps1');
    assert.match(src, /Resolve-FolderS3CliProfile/);
    assert.ok(
      src.includes("'--profile', $cliProfile, 's3api', 'list-objects-v2'"),
    );
    assert.match(src, /Get-FolderS3ObjectMeta[\s\S]{0,200}-AwsProfile/);
  });

  it('onboard list/rm use --profile; no bare aws s3 rm recursive', () => {
    const src = readTool('Invoke-FolderOnboard.ps1');
    assert.ok(
      src.includes("'--profile', $cliProfile, 's3api', 'list-objects-v2'"),
    );
    assert.ok(src.includes("'--profile', $cliProfile, 's3', 'rm'"));
    assert.equal(src.includes('aws s3 rm $prefix --recursive'), false);
  });

  it('dbimport list/delete-object use --profile argv', () => {
    const src = readTool('Invoke-FolderDbImport.ps1');
    assert.ok(
      src.includes("'--profile', $cliProfile, 's3api', 'list-objects-v2'"),
    );
    assert.ok(
      src.includes("'--profile', $cliProfile, 's3api', 'delete-object'"),
    );
    assert.equal(src.includes('aws s3api delete-object --bucket'), false);
  });

  it('fr5176 Pester suite present', () => {
    const src = fs.readFileSync(
      path.join(root, 'tests', 'fr5176-invite-onboard-dbimport-aws-profile.Tests.ps1'),
      'utf8',
    );
    assert.match(src, /Resolve-FolderS3CliProfile/);
    assert.match(src, /list-objects-v2/);
    assert.match(src, /delete-object/);
  });
});