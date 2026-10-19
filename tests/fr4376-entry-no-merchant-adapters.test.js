'use strict';

/**
 * FR #4376: /search entry must not load or ship merchant shop adapters.
 * Do not stage magento provider src into the entry asset (Simon 2026-10-19).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const {
  stageEntryLambdaAsset,
} = require('../scripts/stage-entry-lambda-asset');

function clearEntryCache() {
  for (const key of Object.keys(require.cache)) {
    const norm = key.replace(/\\/g, '/');
    if (
      norm.includes('/entry/src/') ||
      norm.includes('/shared/') ||
      norm.includes('/providers/')
    ) {
      delete require.cache[key];
    }
  }
}

describe('FR #4376 entry has no merchant shop adapters', () => {
  it('staged asset omits shared/shops and magento oauth1', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376-strip'),
    });
    assert.equal(
      fs.existsSync(path.join(outDir, 'shared', 'shops')),
      false,
      'shared/shops must not be in the entry zip',
    );
    assert.equal(
      fs.existsSync(
        path.join(outDir, 'providers', 'local', 'magento', 'src', 'oauth1.js'),
      ),
      false,
      'must not stage magento oauth1 into entry',
    );
  });

  it('fail-when: loading staged entry/src/index.js must not MODULE_NOT_FOUND', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376-load'),
    });
    clearEntryCache();
    const entryIndex = path.join(outDir, 'entry', 'src', 'index.js');
    assert.doesNotThrow(() => require(entryIndex));
  });

  it('fail-when: requiring staged entry must not pull shared/shops or providers/local', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376-graph'),
    });
    clearEntryCache();
    const hits = [];
    const orig = Module.prototype.require;
    Module.prototype.require = function patched(id) {
      const result = orig.apply(this, arguments);
      try {
        const resolved = Module._resolveFilename(id, this);
        const norm = String(resolved).replace(/\\/g, '/');
        if (
          norm.includes('/shared/shops/') ||
          norm.includes('/providers/local/')
        ) {
          hits.push(norm);
        }
      } catch {
        // ignore unresolved optional deps
      }
      return result;
    };
    try {
      require(path.join(outDir, 'entry', 'src', 'index.js'));
    } finally {
      Module.prototype.require = orig;
    }
    assert.deepEqual(
      hits,
      [],
      'entry init must not require shared/shops or providers/local; got ' +
        hits.join(', '),
    );
  });
});
