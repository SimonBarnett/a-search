'use strict';

/**
 * FR-131: stage maintainer Lambda asset to include shared/
 * so schedule.js can require('../../shared/intake/reportException').
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageMaintainerLambdaAsset,
  maintainerHandlerPath,
  requiredMaintainerAssetPaths,
} = require('../scripts/stage-maintainer-lambda-asset');

describe('FR-131 stage maintainer Lambda asset with shared/', () => {
  it('maintainerHandlerPath is maintainer/src/schedule.handler', () => {
    assert.equal(maintainerHandlerPath(), 'maintainer/src/schedule.handler');
  });

  it('staged asset includes schedule.js + shared/intake/reportException.js', () => {
    const outDir = stageMaintainerLambdaAsset(root, {
      outDir: path.join(
        os.tmpdir(),
        `a-search-maintainer-asset-131-${process.pid}`,
      ),
    });
    try {
      for (const rel of requiredMaintainerAssetPaths()) {
        assert.ok(
          fs.existsSync(path.join(outDir, rel)),
          `missing staged path ${rel}`,
        );
      }
      const marker = JSON.parse(
        fs.readFileSync(
          path.join(outDir, '.a-search-maintainer-asset.json'),
          'utf8',
        ),
      );
      assert.equal(marker.shared, true);
      assert.equal(marker.handler, 'maintainer/src/schedule.handler');
      assert.equal(marker.fr, '131');

      // Relative require from staged schedule.js must resolve shared/.
      const schedulePath = path.join(outDir, 'maintainer', 'src', 'schedule.js');
      const sharedFromSchedule = path.resolve(
        path.dirname(schedulePath),
        '..',
        '..',
        'shared',
        'intake',
        'reportException.js',
      );
      assert.ok(
        fs.existsSync(sharedFromSchedule),
        `relative ../../shared from schedule.js missing: ${sharedFromSchedule}`,
      );
      const mod = require(sharedFromSchedule);
      assert.equal(typeof mod.reportException, 'function');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('CDK uses staged maintainer asset (not bare maintainer/src)', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /stageMaintainerLambdaAsset/);
    assert.match(stack, /maintainerHandlerPath/);
    assert.match(
      fs.readFileSync(
        path.join(root, 'scripts', 'stage-maintainer-lambda-asset.js'),
        'utf8',
      ),
      /shared\/intake\/reportException/,
    );
    assert.doesNotMatch(
      stack,
      /Code\.fromAsset\(\s*path\.join\(__dirname,\s*'\.\.',\s*'\.\.',\s*'maintainer',\s*'src'\)\s*\)/,
    );
    // Handler must not stay as bare schedule.handler after staging.
    assert.doesNotMatch(
      stack,
      /MaintainerLiveFunction[\s\S]{0,200}handler:\s*'schedule\.handler'/,
    );
  });
});
