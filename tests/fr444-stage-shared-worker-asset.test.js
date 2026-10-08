'use strict';

/**
 * FR-444: stage shared/ into amazon/worker Lambda asset for reportException.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageProviderWorkerLambdaAsset,
  workerHandlerPath,
  requiredWorkerAssetPaths,
} = require('../scripts/stage-provider-worker-lambda-asset');
const { loadRegistry } = require('../providers/loadRegistry');

describe('FR-444 stage shared/ into amazon worker Lambda asset', () => {
  it('workerHandlerPath keeps .../src/worker.handler (FR-038 pin)', () => {
    assert.equal(
      workerHandlerPath({ id: 'amazon', folder: 'providers/live/amazon' }),
      'providers/live/amazon/src/worker.handler',
    );
  });

  it('staged amazon asset can require reportException via handler relative path', () => {
    const src = loadRegistry().sources.find((s) => s.id === 'amazon');
    assert.ok(src, 'amazon in registry');
    const outDir = stageProviderWorkerLambdaAsset(root, src, {
      outDir: path.join(
        os.tmpdir(),
        `a-search-worker-asset-444-${process.pid}`,
      ),
    });
    try {
      for (const rel of requiredWorkerAssetPaths(src)) {
        assert.ok(
          fs.existsSync(path.join(outDir, rel)),
          `missing staged path ${rel}`,
        );
      }
      const marker = JSON.parse(
        fs.readFileSync(
          path.join(outDir, '.a-search-worker-asset.json'),
          'utf8',
        ),
      );
      assert.equal(marker.shared, true);
      assert.equal(marker.id, 'amazon');

      // Same relative require providers/live/amazon/src/handler.js uses.
      const mod = require(path.join(
        outDir,
        'shared',
        'intake',
        'reportException.js',
      ));
      assert.equal(typeof mod.reportException, 'function');

      const handlerPath = path.join(
        outDir,
        'providers',
        'live',
        'amazon',
        'src',
        'handler.js',
      );
      // Clear require cache so staged copy loads (not repo copy).
      delete require.cache[require.resolve(handlerPath)];
      const handlerMod = require(handlerPath);
      assert.equal(typeof handlerMod.handler, 'function');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('CDK stack stages worker assets via helper (not bare provider/src)', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /stageProviderWorkerLambdaAsset/);
    assert.match(stack, /workerHandlerPath\(src\)/);
    assert.match(stack, /workerHandlerPath\(src\)/);
    assert.match(
      fs.readFileSync(
        path.join(root, 'scripts', 'stage-provider-worker-lambda-asset.js'),
        'utf8',
      ),
      /src\/worker\.handler/,
    );
    assert.doesNotMatch(
      stack,
      /Code\.fromAsset\(path\.join\(__dirname,\s*'\.\.',\s*'\.\.',\s*src\.folder,\s*'src'\)\)/,
    );
    assert.doesNotMatch(stack, /fromAsset\(folderAbs\)/);
  });
});
