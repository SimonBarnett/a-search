'use strict';

/**
 * MRB #4859 hostile: staged amazon normalize.js must resolve
 * ../../../../worker/lib/normalizeProduct (the MODULE_NOT_FOUND from #4848).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { stageEntryLambdaAsset } = require('../scripts/stage-entry-lambda-asset');

const root = path.join(__dirname, '..');

describe('MRB #4859 hostile entry worker/lib', () => {
  it('amazon normalize.js require path matches staged worker/lib', () => {
    const src = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', 'src', 'normalize.js'),
      'utf8',
    );
    assert.match(src, /require\('\.\.\/\.\.\/\.\.\/\.\.\/worker\/lib\/normalizeProduct'\)/);
  });

  it('staged asset loads amazon normalize without MODULE_NOT_FOUND', () => {
    const invoke = path.join(root, 'node_modules', '@aws', 'lambda-invoke-store');
    const jose = path.join(root, 'node_modules', 'jose');
    if (!fs.existsSync(invoke) || !fs.existsSync(jose)) return;
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-mrb4859'),
    });
    try {
      const normPath = path.join(
        outDir,
        'providers',
        'live',
        'amazon',
        'src',
        'normalize.js',
      );
      delete require.cache[require.resolve(normPath)];
      const mod = require(normPath);
      assert.ok(mod);
      const helper = path.join(outDir, 'worker', 'lib', 'normalizeProduct.js');
      const resolved = require.resolve('../../../../worker/lib/normalizeProduct', {
        paths: [path.dirname(normPath)],
      });
      assert.equal(path.normalize(resolved), path.normalize(helper));
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
