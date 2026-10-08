'use strict';

/**
 * FR-415: stage shared/ into entry Lambda asset for reportException.
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

describe('FR-415 stage shared/ into entry Lambda asset', () => {
  it('requiredEntryAssetPaths includes shared/intake/reportException.js', () => {
    const paths = requiredEntryAssetPaths();
    assert.ok(paths.includes('shared/intake/reportException.js'));
    assert.ok(paths.includes('shared/intake/redact.js'));
  });

  it('staged asset can require reportException via entry relative path', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(os.tmpdir(), `a-search-entry-asset-415-${process.pid}`),
    });
    try {
      for (const rel of requiredEntryAssetPaths()) {
        assert.ok(
          fs.existsSync(path.join(outDir, rel)),
          `missing staged path ${rel}`,
        );
      }
      const marker = JSON.parse(
        fs.readFileSync(path.join(outDir, '.a-search-entry-asset.json'), 'utf8'),
      );
      assert.equal(marker.shared, true);
      assert.match(String(marker.fr415), /reportException/);

      // Same relative require entry/src/index.js uses at runtime.
      const fromEntrySrc = path.join(
        outDir,
        'entry',
        'src',
        '..',
        '..',
        'shared',
        'intake',
        'reportException.js',
      );
      assert.ok(fs.existsSync(path.resolve(fromEntrySrc)), fromEntrySrc);
      const mod = require(path.join(
        outDir,
        'shared',
        'intake',
        'reportException.js',
      ));
      assert.equal(typeof mod.reportException, 'function');
      assert.equal(typeof mod.buildIntakePayload, 'function');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('stage script source mentions FR-415 shared copy', () => {
    const src = fs.readFileSync(
      path.join(root, 'scripts', 'stage-entry-lambda-asset.js'),
      'utf8',
    );
    assert.match(src, /FR-415/);
    assert.match(src, /shared/);
    assert.match(src, /reportException/);
    assert.match(src, /fs\.cpSync\(sharedSrc/);
  });
});
