'use strict';

/**
 * FR #4848: amazon @ sandbox selftest MODULE_NOT_FOUND
 * worker/lib/normalizeProduct on the entry Lambda (/var/task/providers/live/amazon/src).
 * Worker assets already stage worker/lib (FR #4414); entry selftest zip did not.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const STAGE = path.join(root, 'scripts', 'stage-entry-lambda-asset.js');
const {
  requiredEntryAssetPaths,
  stageEntryLambdaAsset,
} = require('../scripts/stage-entry-lambda-asset');

describe('FR #4848 entry asset stages worker/lib for amazon selftest', () => {
  it('requiredEntryAssetPaths lists worker/lib/normalizeProduct.js', () => {
    const paths = requiredEntryAssetPaths();
    assert.ok(
      paths.includes('worker/lib/normalizeProduct.js'),
      paths.join(','),
    );
  });

  it('stage-entry script copies worker/lib fail-closed', () => {
    const src = fs.readFileSync(STAGE, 'utf8');
    assert.match(src, /worker['"]?\s*,\s*['"]lib['"]/);
    assert.match(src, /normalizeProduct/);
    assert.match(src, /FR #4848/);
  });

  it('staged entry amazon search can require normalizeProduct', () => {
    const invoke = path.join(
      root,
      'node_modules',
      '@aws',
      'lambda-invoke-store',
    );
    const jose = path.join(root, 'node_modules', 'jose');
    if (!fs.existsSync(invoke) || !fs.existsSync(jose)) {
      return;
    }
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4848'),
    });
    try {
      const helper = path.join(outDir, 'worker', 'lib', 'normalizeProduct.js');
      assert.ok(fs.existsSync(helper), 'missing staged worker/lib/normalizeProduct.js');
      const searchPath = path.join(
        outDir,
        'providers',
        'live',
        'amazon',
        'src',
        'search.js',
      );
      delete require.cache[require.resolve(searchPath)];
      const search = require(searchPath);
      assert.equal(typeof search.searchAmazon, 'function');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
