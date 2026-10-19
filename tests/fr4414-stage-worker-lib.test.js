'use strict';

/**
 * FR #4414: amazon live worker requires ../../../../worker/lib/normalizeProduct.
 * Stage worker/lib into the provider worker Lambda asset; load worker.js from
 * the staged tree only (temp dir outside the repo checkout).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

const root = path.join(__dirname, '..');
const {
  stageProviderWorkerLambdaAsset,
  requiredWorkerAssetPaths,
} = require('../scripts/stage-provider-worker-lambda-asset');
const { loadRegistry } = require('../providers/loadRegistry');

function clearStagedCache(outDir) {
  const normOut = outDir.replace(/\\/g, '/');
  for (const key of Object.keys(require.cache)) {
    const norm = key.replace(/\\/g, '/');
    if (norm.startsWith(normOut) || norm.includes('/worker/lib/')) {
      delete require.cache[key];
    }
  }
}

describe('FR #4414 stage worker/lib into amazon worker asset', () => {
  it('stage script copies worker/lib fail-closed (source pin)', () => {
    const src = fs.readFileSync(
      path.join(root, 'scripts', 'stage-provider-worker-lambda-asset.js'),
      'utf8',
    );
    assert.match(src, /FR #4414|4414/);
    assert.match(src, /workerLibSrc|worker['"`],\s*['"`]lib['"`]/);
    assert.match(src, /normalizeProduct/);
  });

  it('requiredWorkerAssetPaths includes worker/lib/normalizeProduct.js', () => {
    const paths = requiredWorkerAssetPaths({
      id: 'amazon',
      folder: 'providers/live/amazon',
    });
    assert.ok(
      paths.includes('worker/lib/normalizeProduct.js'),
      'requiredWorkerAssetPaths must list worker/lib/normalizeProduct.js',
    );
  });

  it('staged amazon asset includes worker/lib and loads worker.js outside repo', () => {
    const invoke = path.join(
      root,
      'node_modules',
      '@aws',
      'lambda-invoke-store',
    );
    if (!fs.existsSync(invoke)) {
      // Seat without npm install: static pins above still gate CI after install.
      return;
    }
    const src = loadRegistry().sources.find((s) => s.id === 'amazon');
    assert.ok(src, 'amazon in registry');

    const outDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'a-search-fr4414-amazon-'),
    );
    // Ensure staged tree is not under the repo checkout.
    assert.equal(
      outDir.replace(/\\/g, '/').startsWith(root.replace(/\\/g, '/')),
      false,
      'staged outDir must be outside the repo',
    );

    try {
      stageProviderWorkerLambdaAsset(root, src, { outDir });

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
      assert.equal(marker.workerLib, true);

      clearStagedCache(outDir);
      const workerJs = path.join(
        outDir,
        'providers',
        'live',
        'amazon',
        'src',
        'worker.js',
      );
      const req = createRequire(workerJs);
      let mod;
      assert.doesNotThrow(() => {
        mod = req(workerJs);
      }, 'staged amazon worker.js must load without MODULE_NOT_FOUND');
      assert.equal(typeof mod.run, 'function');

      // Relative require used by normalize.js must resolve inside the asset.
      const norm = req('../../../../worker/lib/normalizeProduct');
      assert.equal(typeof norm.normalizeProduct, 'function');
      const resolved = req.resolve('../../../../worker/lib/normalizeProduct');
      assert.ok(
        resolved.replace(/\\/g, '/').startsWith(outDir.replace(/\\/g, '/')),
        'normalizeProduct must resolve under staged outDir, got ' + resolved,
      );
    } finally {
      clearStagedCache(outDir);
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
