'use strict';

/**
 * FR #5078: Invoke-FolderSearch must SigV4 with resolved AWS credentials,
 * never the profile name as the access key.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tools', 'Invoke-FolderSearch.ps1');

describe('FR #5078 Invoke-FolderSearch SigV4 credentials', () => {
  it('resolves credentials via export-credentials and never uses profile as --user', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8');
    assert.match(src, /export-credentials/);
    assert.match(src, /AccessKeyId/);
    assert.match(src, /SecretAccessKey/);
    assert.match(src, /x-amz-security-token/);
    assert.match(src, /Resolve-AwsCliCredentials|ResolveAwsCredentials/);
    // Bug shape from FR #4888 / 559cae0: profile name as access key
    assert.doesNotMatch(
      src,
      /--user\s*\(\s*"\{0\}:"\s*-f\s*\$AwsProfile\s*\)/,
    );
    assert.doesNotMatch(src, /--user\s*\(\s*"\{0\}:"\s*-f\s*\$profile\s*\)/i);
  });
});