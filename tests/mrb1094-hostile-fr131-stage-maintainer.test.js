'use strict';

/**
 * docs/mrb-1094: hostile pins for FR-131 stage maintainer Lambda asset (PR #1094).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const stagePath = path.join(
  root,
  'scripts',
  'stage-maintainer-lambda-asset.js',
);
const productTest = path.join(
  root,
  'tests',
  'fr131-stage-maintainer-lambda-asset.test.js',
);

function assertNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(
    !(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${path.relative(root, filePath)} must be UTF-8 without BOM`,
  );
}

describe('MRB #1094 hostile FR-131 stage maintainer asset', () => {
  it('stage script + product pin + park Decision LOCKED (UTF-8 no-BOM)', () => {
    assert.ok(fs.existsSync(stagePath));
    assert.ok(fs.existsSync(productTest));
    assertNoBom(stagePath);
    assertNoBom(productTest);
    assertNoBom(path.join(root, 'docs', 'fr', 'FR-131.md'));
    assertNoBom(
      path.join(root, 'tests', 'mrb1094-hostile-fr131-stage-maintainer.test.js'),
    );

    const stage = fs.readFileSync(stagePath, 'utf8');
    assert.match(stage, /stageMaintainerLambdaAsset/);
    assert.match(stage, /maintainer\/src\/schedule\.handler/);
    assert.match(stage, /shared\/intake\/reportException/);
    assert.match(stage, /fs\.cpSync\(sharedSrc/);

    const park = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-131.md'), 'utf8');
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /stage-maintainer-lambda-asset/);
    assert.match(park, /maintainer\/src\/schedule\.handler/);

    const product = fs.readFileSync(productTest, 'utf8');
    assert.match(product, /stageMaintainerLambdaAsset/);
    assert.match(product, /reportException/);
    assert.match(product, /doesNotMatch[\s\S]*schedule\.handler/);
  });

  it('staged asset resolves ../../shared/intake/reportException from schedule.js', () => {
    const {
      stageMaintainerLambdaAsset,
      requiredMaintainerAssetPaths,
      maintainerHandlerPath,
    } = require('../scripts/stage-maintainer-lambda-asset');
    assert.equal(maintainerHandlerPath(), 'maintainer/src/schedule.handler');
    const outDir = stageMaintainerLambdaAsset(root, {
      outDir: path.join(
        os.tmpdir(),
        `a-search-mrb1094-maintainer-${process.pid}`,
      ),
    });
    try {
      for (const rel of requiredMaintainerAssetPaths()) {
        assert.ok(fs.existsSync(path.join(outDir, rel)), rel);
      }
      const schedulePath = path.join(outDir, 'maintainer', 'src', 'schedule.js');
      const sharedFromSchedule = path.resolve(
        path.dirname(schedulePath),
        '..',
        '..',
        'shared',
        'intake',
        'reportException.js',
      );
      assert.ok(fs.existsSync(sharedFromSchedule), sharedFromSchedule);
      delete require.cache[require.resolve(sharedFromSchedule)];
      const mod = require(sharedFromSchedule);
      assert.equal(typeof mod.reportException, 'function');
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });

  it('CDK stack wires stageMaintainerLambdaAsset; synth Handlers are staged paths', () => {
    const stack = fs.readFileSync(stackPath, 'utf8');
    assert.match(stack, /stageMaintainerLambdaAsset\(repoRoot\)/);
    assert.match(stack, /handler:\s*maintainerHandlerPath\(\)/);
    assert.doesNotMatch(
      stack,
      /Code\.fromAsset\(\s*path\.join\(__dirname,\s*'\.\.',\s*'\.\.',\s*'maintainer',\s*'src'\)\s*\)/,
    );
    assert.doesNotMatch(
      stack,
      /MaintainerLiveFunction[\s\S]{0,280}handler:\s*'schedule\.handler'/,
    );
    assert.doesNotMatch(
      stack,
      /MaintainerSandboxFunction[\s\S]{0,280}handler:\s*'schedule\.handler'/,
    );

    const r = runCdkSynth(root, { timeout: 180_000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const tpl = JSON.parse(
      fs.readFileSync(
        path.join(root, 'cdk.out', 'ASearchStack.template.json'),
        'utf8',
      ),
    );
    const fns = Object.values(tpl.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::Function',
    );
    for (const name of [
      'a-search-maintainer-live',
      'a-search-maintainer-sandbox',
    ]) {
      const fn = fns.find(
        (res) => res.Properties && res.Properties.FunctionName === name,
      );
      assert.ok(fn, name);
      assert.equal(
        fn.Properties.Handler,
        'maintainer/src/schedule.handler',
        name,
      );
    }
  });

  it('release-gap marks maintainer shared/ staging done (FR-131)', () => {
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /Maintainer zip includes `shared\/`\s*\|\s*\*\*Yes\*\*.*FR-131/i,
    );
    assert.doesNotMatch(
      gap,
      /Maintainer zip includes `shared\/`\s*\|\s*\*\*No\*\*/,
    );
    assert.match(gap, /stage-maintainer-lambda-asset|FR-131/);
  });
});
