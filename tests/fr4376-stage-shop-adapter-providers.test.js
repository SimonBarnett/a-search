'use strict';

/**
 * FR #4376: staged entry asset must resolve shop-adapter requires into providers/.
 * Magento is merchantConnect but disabled for selftest, so FR-152 probe staging
 * alone leaves oauth1 out of the zip and a-search-entry dies at init.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const {
  stageEntryLambdaAsset,
} = require('../scripts/stage-entry-lambda-asset');

function clearAdapterAndProviderCache() {
  for (const key of Object.keys(require.cache)) {
    const norm = key.replace(/\\/g, '/');
    if (
      norm.includes('/shared/shops/adapters/') ||
      norm.includes('/providers/local/magento/') ||
      norm.includes('/entry/src/') ||
      norm.includes('/shared/')
    ) {
      delete require.cache[key];
    }
  }
}

describe('FR #4376 shop adapter providers staged for entry Lambda', () => {
  it('stages providers/local/magento/src/oauth1.js even when magento selftest is off', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376'),
    });
    const oauth1 = path.join(
      outDir,
      'providers',
      'local',
      'magento',
      'src',
      'oauth1.js',
    );
    assert.ok(fs.existsSync(oauth1), 'missing staged magento oauth1');
  });

  it('fail-when: requiring staged adapters/index must not throw MODULE_NOT_FOUND', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376-load'),
    });
    const adapterIndex = path.join(
      outDir,
      'shared',
      'shops',
      'adapters',
      'index.js',
    );
    clearAdapterAndProviderCache();
    assert.doesNotThrow(() => require(adapterIndex));
    const { listProviders } = require(adapterIndex);
    assert.ok(listProviders().includes('magento'));
  });

  it('fail-when: requiring staged entry/src/index.js must not MODULE_NOT_FOUND magento', () => {
    const outDir = stageEntryLambdaAsset(root, {
      outDir: path.join(root, 'cdk', 'entry-lambda-asset-fr4376-entry'),
    });
    const entryIndex = path.join(outDir, 'entry', 'src', 'index.js');
    clearAdapterAndProviderCache();
    try {
      require(entryIndex);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      assert.doesNotMatch(
        msg,
        /providers[/\\]+local[/\\]+magento/,
        'staged entry must resolve magento oauth1; got: ' + msg,
      );
    }
  });
});
