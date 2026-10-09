'use strict';

/**
 * FR-135: stage mssql (+ transitive) into local worker + maintainer Lambda assets.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageMssqlNodeModules,
  isLocalProviderFolder,
} = require('../scripts/stage-mssql-node-modules');
const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');
const {
  stageMaintainerLambdaAsset,
  requiredMaintainerAssetPaths,
} = require('../scripts/stage-maintainer-lambda-asset');
const { loadRegistry } = require('../providers/loadRegistry');

describe('FR-135 stage mssql into local worker + maintainer assets', () => {
  it('isLocalProviderFolder detects providers/local/* only', () => {
    assert.equal(isLocalProviderFolder('providers/local/awin'), true);
    assert.equal(isLocalProviderFolder('providers/local/impact'), true);
    assert.equal(isLocalProviderFolder('providers/live/amazon'), false);
  });

  it('stageMssqlNodeModules copies mssql package.json into asset', () => {
    assert.ok(
      fs.existsSync(path.join(root, 'node_modules', 'mssql')),
      'repo node_modules/mssql required (npm install)',
    );
    const outDir = path.join(
      os.tmpdir(),
      `a-search-mssql-stage-${process.pid}`,
    );
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const { packages } = stageMssqlNodeModules(root, outDir);
      assert.ok(packages.includes('mssql'));
      assert.ok(
        fs.existsSync(path.join(outDir, 'node_modules', 'mssql', 'package.json')),
      );
      // require from staged tree (Node resolves from cwd/node_modules under asset)
      const staged = require(path.join(outDir, 'node_modules', 'mssql'));
      assert.ok(staged);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('awin worker asset includes node_modules/mssql; amazon live does not', () => {
    const awin = loadRegistry().sources.find((s) => s.id === 'awin');
    const amazon = loadRegistry().sources.find((s) => s.id === 'amazon');
    assert.ok(awin && amazon);
    const awinOut = stageProviderWorkerLambdaAsset(root, awin, {
      outDir: path.join(os.tmpdir(), `a-search-worker-awin-135-${process.pid}`),
    });
    const amzOut = stageProviderWorkerLambdaAsset(root, amazon, {
      outDir: path.join(os.tmpdir(), `a-search-worker-amz-135-${process.pid}`),
    });
    try {
      assert.ok(
        fs.existsSync(path.join(awinOut, 'node_modules', 'mssql', 'package.json')),
      );
      const marker = JSON.parse(
        fs.readFileSync(path.join(awinOut, '.a-search-worker-asset.json'), 'utf8'),
      );
      assert.equal(marker.mssql, true);
      assert.ok(Array.isArray(marker.mssqlPackages) && marker.mssqlPackages.includes('mssql'));
      assert.ok(
        !fs.existsSync(path.join(amzOut, 'node_modules', 'mssql')),
        'live amazon must not stage mssql',
      );
    } finally {
      fs.rmSync(awinOut, { recursive: true, force: true });
      fs.rmSync(amzOut, { recursive: true, force: true });
    }
  });

  it('maintainer asset includes node_modules/mssql', () => {
    const outDir = stageMaintainerLambdaAsset(root, {
      outDir: path.join(os.tmpdir(), `a-search-maintainer-135-${process.pid}`),
    });
    try {
      for (const rel of requiredMaintainerAssetPaths()) {
        assert.ok(fs.existsSync(path.join(outDir, rel)), `missing ${rel}`);
      }
      const marker = JSON.parse(
        fs.readFileSync(
          path.join(outDir, '.a-search-maintainer-asset.json'),
          'utf8',
        ),
      );
      assert.equal(marker.mssql, true);
      assert.ok(marker.mssqlPackages.includes('mssql'));
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('CDK stack still stages local workers via helper (source pin)', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /stageProviderWorkerLambdaAsset/);
    assert.match(stack, /stageMaintainerLambdaAsset/);
    assert.match(
      fs.readFileSync(
        path.join(root, 'scripts', 'stage-provider-worker-lambda-asset.js'),
        'utf8',
      ),
      /stageMssqlNodeModules/,
    );
    assert.match(
      fs.readFileSync(
        path.join(root, 'scripts', 'stage-maintainer-lambda-asset.js'),
        'utf8',
      ),
      /stageMssqlNodeModules/,
    );
  });
});