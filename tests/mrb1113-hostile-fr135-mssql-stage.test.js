'use strict';

/**
 * Hostile pins for MRB a-search#1113 / FR-135 mssql staging (product #1113).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workerStage = path.join(root, 'scripts', 'stage-provider-worker-lambda-asset.js');
const maintStage = path.join(root, 'scripts', 'stage-maintainer-lambda-asset.js');
const mssqlHelper = path.join(root, 'scripts', 'stage-mssql-node-modules.js');
const gap = path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md');

describe('MRB #1113 hostile FR-135 mssql staging', () => {
  it('worker stage keep-both FR-134 SDK + FR-135 mssql (local only)', () => {
    const text = fs.readFileSync(workerStage, 'utf8');
    assert.match(text, /stageMssqlNodeModules/);
    assert.match(text, /isLocalProviderFolder/);
    assert.match(text, /@aws-sdk/);
    assert.match(text, /client-s3/);
    assert.match(text, /awsSdkS3/);
    assert.match(text, /mssqlPackages/);
    // Contiguous local-only gate
    assert.match(
      text,
      /isLocalProviderFolder\(folderPosix\)[\s\S]{0,80}?stageMssqlNodeModules/,
    );
  });

  it('maintainer stage marks mssql true and requires package.json path', () => {
    const text = fs.readFileSync(maintStage, 'utf8');
    assert.match(text, /stageMssqlNodeModules/);
    assert.match(text, /mssql:\s*true/);
    assert.match(text, /node_modules\/mssql\/package\.json/);
    assert.match(text, /fr:\s*'131'/);
  });

  it('shared helper exports stageMssqlNodeModules + isLocalProviderFolder', () => {
    const text = fs.readFileSync(mssqlHelper, 'utf8');
    assert.match(text, /function stageMssqlNodeModules/);
    assert.match(text, /function isLocalProviderFolder/);
    assert.match(text, /providers\/local\//);
  });

  it('release-gap no longer claims mssql still No', () => {
    const text = fs.readFileSync(gap, 'utf8');
    assert.match(text, /mssql/i);
    assert.doesNotMatch(
      text,
      /`mssql` still \*\*No\*\* \(FR-135 #971\)/,
    );
    assert.match(text, /FR-135/);
  });
});
