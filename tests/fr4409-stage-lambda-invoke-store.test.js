'use strict';

/**
 * FR #4409: entry Lambda asset must stage @aws/lambda-invoke-store
 * (transitive of @aws-sdk/core used by client-s3 in agentSearch).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageEntryLambdaAsset,
  requiredEntryAssetPaths,
} = require('../scripts/stage-entry-lambda-asset');

const INVOKE_STORE = 'node_modules/@aws/lambda-invoke-store/package.json';

describe('FR-4409 entry stages @aws/lambda-invoke-store', () => {
  it('stage-entry-lambda-asset.js copies node_modules/@aws (lambda-invoke-store)', () => {
    const src = fs.readFileSync(
      path.join(root, 'scripts', 'stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(src, /@aws\/lambda-invoke-store|node_modules['"`],\s*['"`]@aws['"`]/);
    assert.match(src, /FR-4409|4409/);
  });

  it('requiredEntryAssetPaths includes @aws/lambda-invoke-store', () => {
    const paths = requiredEntryAssetPaths();
    assert.ok(
      paths.includes(INVOKE_STORE) ||
        paths.includes('node_modules/@aws/lambda-invoke-store'),
      'requiredEntryAssetPaths must list lambda-invoke-store',
    );
  });

  it('package.json depends on @aws/lambda-invoke-store', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    );
    assert.ok(
      pkg.dependencies && pkg.dependencies['@aws/lambda-invoke-store'],
      'direct dependency so npm install always stages the module',
    );
  });

  it('staged entry asset includes lambda-invoke-store when @aws-sdk is present', () => {
    const sdk = path.join(root, 'node_modules', '@aws-sdk', 'client-s3');
    if (!fs.existsSync(sdk)) {
      // Local seats without npm install: static pins above still gate CI after install.
      return;
    }
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr4409-'));
    try {
      stageEntryLambdaAsset(root, { outDir });
      const staged = path.join(outDir, INVOKE_STORE);
      assert.ok(
        fs.existsSync(staged),
        `expected ${INVOKE_STORE} in staged asset (FR #4409)`,
      );
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});