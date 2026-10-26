'use strict';

/**
 * docs/mrb-5186 hostile: download list-objects-v2 must pass --profile (FR #5180).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DOWNLOAD = path.join(__dirname, '..', 'tools', 'Invoke-FolderDownload.ps1');
const README = path.join(__dirname, '..', 'tools', 'README-folder-tools.md');

describe('MRB #5186 hostile FR #5180 download --profile', () => {
  it('list-objects-v2 argv includes --profile; no bare s3api builder; README cites #5180', () => {
    const raw = fs.readFileSync(DOWNLOAD, 'utf8');
    assert.ok(
      raw.includes("'--profile', $cliProfile, 's3api', 'list-objects-v2'"),
      'argv --profile before s3api list-objects-v2',
    );
    assert.ok(
      /Get-FolderDownloadProviderNames[\s\S]{0,120}-AwsProfile/.test(raw),
      'caller passes -AwsProfile',
    );
    const code = raw
      .replace(/^\s*#.*$/gm, '')
      .replace(/<#[\s\S]*?#>/g, '');
    assert.equal(
      /\bawsArgs\s*=\s*@\(\s*'s3api',\s*'list-objects-v2'/.test(code),
      false,
      'no bare awsArgs list-objects-v2',
    );
    const readme = fs.readFileSync(README);
    assert.notEqual(readme[0], 0xef, 'README no UTF-8 BOM');
    const readmeText = readme.toString('utf8');
    assert.ok(readmeText.includes('#5180'), 'README cites FR #5180');
    assert.ok(
      readmeText.includes('Get-FolderDownloadProviderNames') ||
        readmeText.includes('list-objects-v2'),
      'README documents list --profile',
    );
  });
});
