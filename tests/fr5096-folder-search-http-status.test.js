'use strict';

/**
 * FR #5096: folder-search non-2xx exit + annotator DescribeStacks for SearchApiUrl.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

describe('FR #5096 folder-search HTTP status + URL resolve', () => {
  it('Invoke-FolderSearch exits 5 on non-2xx and captures curl http_code', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'tools', 'Invoke-FolderSearch.ps1'),
      'utf8',
    );
    assert.match(src, /FR #5096/);
    assert.match(src, /function ConvertTo-SearchHttpResult/);
    assert.match(src, /__HTTP_STATUS__/);
    assert.match(src, /search_http_status=/);
    assert.match(src, /searchid_missing/);
    assert.match(src, /if \(\$searchFailed\) \{ exit 5 \}/);
  });

  it('CDK grants annotator cloudformation:DescribeStacks on this stack', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /FR #5096/);
    assert.match(stack, /cloudformation:DescribeStacks/);
    assert.match(stack, /a-search-redqueen-annotator/);
    assert.match(
      stack,
      /arn:aws:cloudformation:\$\{this\.region\}:\$\{this\.account\}:stack\/\$\{this\.stackName\}\/\*/,
    );
  });

  it('docs mention exit 5 and folder-tools.config.json preferred URL', () => {
    const readme = fs.readFileSync(
      path.join(ROOT, 'tools', 'README-folder-tools.md'),
      'utf8',
    );
    assert.match(readme, /FR #5096/);
    assert.match(readme, /exit 5|exits `5`/);
    assert.match(readme, /folder-tools\.config\.json/);
  });
});
