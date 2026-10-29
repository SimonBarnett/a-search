'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEPLOY_PS1 = path.resolve(
  __dirname,
  '..',
  'walrus',
  'install',
  'Deploy-WalrusSqlDrain.ps1',
);

describe('FR #5299 npm fallback under StrictMode', () => {
  it('invokes npm using a command/path string rather than Get-Item.Source', () => {
    const src = fs.readFileSync(DEPLOY_PS1, 'utf8');

    assert.match(src, /\$npmCmd = 'npm'/);
    assert.match(src, /Get-Command \$npmCmd -ErrorAction SilentlyContinue/);
    assert.match(src, /\$npmCmd = \$npmBeside/);
    assert.match(src, /& \$npmCmd install --omit=dev/);
    assert.doesNotMatch(src, /\$npmCmd\.Source/);
  });
});
