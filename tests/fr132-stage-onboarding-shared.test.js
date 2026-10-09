'use strict';

/**
 * FR-132: stage shared/ into awin/impact onboarding Lambda assets.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.join(__dirname, '..');
const {
  stageOnboardingLambdaAsset,
  onboardingHandlerPath,
  requiredOnboardingAssetPaths,
  ONBOARDING_FOLDERS,
} = require('../scripts/stage-onboarding-lambda-asset');
const { runCdkSynth } = require('./helpers/runCdkSynth');

describe('FR-132 stage shared/ into onboarding Lambda assets', () => {
  it('onboardingHandlerPath keeps providers/local/<id>/onboarding/src/handler.handler', () => {
    assert.equal(
      onboardingHandlerPath('providers/local/awin/onboarding'),
      'providers/local/awin/onboarding/src/handler.handler',
    );
    assert.equal(
      onboardingHandlerPath('providers/local/impact/onboarding'),
      'providers/local/impact/onboarding/src/handler.handler',
    );
  });

  it('ONBOARDING_FOLDERS covers awin + impact only', () => {
    assert.deepEqual(
      [...ONBOARDING_FOLDERS].sort(),
      [
        'providers/local/awin/onboarding',
        'providers/local/impact/onboarding',
      ].sort(),
    );
  });

  for (const folder of ONBOARDING_FOLDERS) {
    it(`staged ${folder} asset can require shared/identity/userId via relative path`, () => {
      const id = folder.split('/')[2];
      const outDir = stageOnboardingLambdaAsset(root, folder, {
        outDir: path.join(
          os.tmpdir(),
          `a-search-onboarding-asset-132-${id}-${process.pid}`,
        ),
      });
      try {
        for (const rel of requiredOnboardingAssetPaths(folder)) {
          assert.ok(
            fs.existsSync(path.join(outDir, rel)),
            `missing staged path ${rel}`,
          );
        }
        const marker = JSON.parse(
          fs.readFileSync(
            path.join(outDir, '.a-search-onboarding-asset.json'),
            'utf8',
          ),
        );
        assert.equal(marker.shared, true);
        assert.equal(marker.fr, '132');
        assert.equal(marker.id, id);
        assert.equal(marker.handler, onboardingHandlerPath(folder));

        // Same relative require emitSignupRow.js uses:
        // ../../../../../shared/identity/userId from .../onboarding/src/
        const fromSrc = path.join(
          outDir,
          ...folder.split('/'),
          'src',
          '..',
          '..',
          '..',
          '..',
          '..',
          'shared',
          'identity',
          'userId.js',
        );
        assert.ok(fs.existsSync(path.resolve(fromSrc)), fromSrc);

        const mod = require(path.join(
          outDir,
          'shared',
          'identity',
          'userId.js',
        ));
        assert.equal(typeof mod.assertUserId, 'function');

        const handlerPath = path.join(
          outDir,
          ...folder.split('/'),
          'src',
          'handler.js',
        );
        delete require.cache[require.resolve(handlerPath)];
        const handlerMod = require(handlerPath);
        assert.equal(typeof handlerMod.handler, 'function');
      } finally {
        fs.rmSync(outDir, { recursive: true, force: true });
      }
    });
  }

  it('CDK stack stages onboarding assets via helper (not bare onboarding/src)', () => {
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /stageOnboardingLambdaAsset/);
    assert.match(stack, /onboardingHandlerPath/);
    assert.match(
      fs.readFileSync(
        path.join(root, 'scripts', 'stage-onboarding-lambda-asset.js'),
        'utf8',
      ),
      /shared\/identity\/userId/,
    );
    assert.doesNotMatch(
      stack,
      /fromAsset\(\s*path\.join\(\s*__dirname[\s\S]*?'onboarding'[\s\S]*?'src'\s*\)\s*\)/,
    );
    assert.doesNotMatch(
      stack,
      /handler:\s*'handler\.handler'/,
    );
  });

  it('npm run synth exits 0; template handlers use staged onboarding paths', () => {
    const r = runCdkSynth(root, { timeout: 180_000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(
      root,
      'cdk.out',
      'ASearchStack.template.json',
    );
    assert.ok(fs.existsSync(templatePath), 'synth must emit template');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const fns = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::Function',
    );
    const expected = {
      'a-search-awin-onboarding-live':
        'providers/local/awin/onboarding/src/handler.handler',
      'a-search-awin-onboarding-sandbox':
        'providers/local/awin/onboarding/src/handler.handler',
      'a-search-impact-onboarding-live':
        'providers/local/impact/onboarding/src/handler.handler',
      'a-search-impact-onboarding-sandbox':
        'providers/local/impact/onboarding/src/handler.handler',
    };
    for (const [name, handler] of Object.entries(expected)) {
      const fn = fns.find(
        (res) => res.Properties && res.Properties.FunctionName === name,
      );
      assert.ok(fn, `template must include ${name}`);
      assert.equal(fn.Properties.Handler, handler, name);
    }
  });
});
