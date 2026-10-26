'use strict';

/**
 * MRB #5170 hostile pin for FR #5169 shared AWS profile resolver.
 * Refs SimonBarnett/a-search#5170 / #5169.
 * Contiguous needles: Resolve-FolderToolsAwsProfile, annotator default,
 * agents env ignored across folder CLI tools.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const tools = path.join(root, 'tools');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #5170 hostile: shared Resolve-FolderToolsAwsProfile', () => {
  it('FolderS3 defines Resolve-FolderToolsAwsProfile with annotator default', () => {
    const src = read('tools/FolderS3.ps1');
    assert.match(src, /function Resolve-FolderToolsAwsProfile/);
    assert.match(src, /return 'a-search-redqueen-annotator'/);
    const fn = src.match(
      /function Resolve-FolderToolsAwsProfile\s*\{[\s\S]*?^\}/m,
    );
    assert.ok(fn, 'Resolve-FolderToolsAwsProfile body present');
    const code = fn[0]
      .replace(/<#[\s\S]*?#>/g, '')
      .replace(/^\s*#.*$/gm, '');
    assert.doesNotMatch(code, /A_SEARCH_AGENTS_AWS_PROFILE/);
    assert.doesNotMatch(code, /\$env:AWS_PROFILE/);
  });

  it('search Resolve-AwsProfileName delegates and drops agents env flag', () => {
    const src = read('tools/Invoke-FolderSearch.ps1');
    assert.match(src, /Resolve-FolderToolsAwsProfile/);
    const fn = src.match(/function Resolve-AwsProfileName\s*\{[\s\S]*?^\}/m);
    assert.ok(fn, 'Resolve-AwsProfileName present');
    const code = fn[0].replace(/^\s*#.*$/gm, '');
    assert.match(code, /Resolve-FolderToolsAwsProfile/);
    assert.doesNotMatch(code, /A_SEARCH_AGENTS_AWS_PROFILE/);
    assert.doesNotMatch(code, /\$env:AWS_PROFILE/);
    assert.doesNotMatch(
      src,
      /\$hasProfileFlag\s*=\s*\[bool\]\$AwsProfile\s*-or\s*\[bool\]\$env:A_SEARCH_AGENTS_AWS_PROFILE/,
    );
  });

  it('meta/download/onboard share FolderS3 resolver', () => {
    for (const name of [
      'Get-FolderMeta.ps1',
      'Invoke-FolderDownload.ps1',
      'Invoke-FolderOnboard.ps1',
    ]) {
      const src = fs.readFileSync(path.join(tools, name), 'utf8');
      assert.match(
        src,
        /Resolve-FolderToolsAwsProfile/,
        `${name} must call Resolve-FolderToolsAwsProfile`,
      );
    }
  });

  it('fr5169 Pester suite pins shared resolver acceptance', () => {
    const src = read('tests/fr5169-shared-aws-profile.Tests.ps1');
    assert.match(src, /Resolve-FolderToolsAwsProfile/);
    assert.match(src, /a-search-redqueen-annotator/);
    assert.match(src, /A_SEARCH_AGENTS_AWS_PROFILE/);
    assert.match(src, /uses config AwsProfile when A_SEARCH_AGENTS_AWS_PROFILE is agents/);
  });
});
