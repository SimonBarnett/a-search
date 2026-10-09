'use strict';

/**
 * FR-134: bundle @aws-sdk/client-s3 (+ @smithy) into provider worker Lambda assets.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageProviderWorkerLambdaAsset,
  requiredWorkerAssetPaths,
} = require('../scripts/stage-provider-worker-lambda-asset');
const { loadRegistry } = require('../providers/loadRegistry');

describe('FR-134 stage @aws-sdk/client-s3 into amazon worker Lambda asset', () => {
  it('requiredWorkerAssetPaths includes node_modules/@aws-sdk/client-s3', () => {
    const paths = requiredWorkerAssetPaths({
      id: 'amazon',
      folder: 'providers/live/amazon',
    });
    assert.ok(paths.includes('node_modules/@aws-sdk/client-s3'));
    assert.ok(
      paths.some((p) => p.includes('client-s3')),
      'client-s3 path required',
    );
  });

  it('stage script mirrors entry SDK + smithy copy', () => {
    const src = fs.readFileSync(
      path.join(root, 'scripts', 'stage-provider-worker-lambda-asset.js'),
      'utf8',
    );
    assert.match(src, /FR-134/);
    assert.match(src, /@aws-sdk\/client-s3/);
    assert.match(src, /@smithy/);
    assert.match(src, /node_modules['"],\s*['"]@aws-sdk/);
  });

  it('staged amazon asset includes @aws-sdk/client-s3 (and smithy when present)', () => {
    const sdkRoot = path.join(root, 'node_modules', '@aws-sdk', 'client-s3');
    assert.ok(
      fs.existsSync(sdkRoot),
      'repo node_modules/@aws-sdk/client-s3 required (npm install)',
    );

    const src = loadRegistry().sources.find((s) => s.id === 'amazon');
    assert.ok(src, 'amazon in registry');
    const outDir = stageProviderWorkerLambdaAsset(root, src, {
      outDir: path.join(
        os.tmpdir(),
        `a-search-worker-asset-134-${process.pid}`,
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
      assert.equal(marker.awsSdkS3, true);
      assert.equal(marker.fr, '444');
      assert.match(String(marker.fr134), /@aws-sdk\/client-s3/);

      const stagedSdk = path.join(
        outDir,
        'node_modules',
        '@aws-sdk',
        'client-s3',
      );
      assert.ok(fs.existsSync(stagedSdk), stagedSdk);
      // writeResults require('@aws-sdk/client-s3') resolves from asset root.
      const resolved = require.resolve('@aws-sdk/client-s3', {
        paths: [outDir],
      });
      assert.ok(
        resolved.includes(`${path.sep}node_modules${path.sep}@aws-sdk${path.sep}client-s3`),
        `resolve from staged root: ${resolved}`,
      );

      const smithySrc = path.join(root, 'node_modules', '@smithy');
      if (fs.existsSync(smithySrc)) {
        assert.ok(
          fs.existsSync(path.join(outDir, 'node_modules', '@smithy')),
          'staged @smithy when present in repo',
        );
      }
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('release-gap row notes worker zip includes client-s3 (FR-134)', () => {
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /Worker zip includes `@aws-sdk\/client-s3`[\s\S]{0,160}FR-134/,
    );
    assert.match(
      gap,
      /Worker zip includes `@aws-sdk\/client-s3`[\s\S]{0,200}@smithy/,
    );
  });
});
