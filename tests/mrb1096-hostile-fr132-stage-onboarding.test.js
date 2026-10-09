'use strict';

/** docs/mrb-1096: hostile pins for FR-132 stage onboarding + shared/ (PR #1096). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1096 hostile FR-132 stage onboarding shared', () => {
  it('stack imports stageOnboarding + stageMaintainer; uses staged handlers', () => {
    const t = read('cdk/lib/a-search-stack.js');
    assert.match(t, /stage-onboarding-lambda-asset/);
    assert.match(t, /stage-maintainer-lambda-asset/);
    assert.match(t, /stageOnboardingLambdaAsset/);
    assert.match(t, /onboardingHandlerPath/);
    assert.match(t, /providers\/local\/awin\/onboarding/);
    assert.match(t, /providers\/local\/impact\/onboarding/);
    assert.doesNotMatch(
      t,
      /Code\.fromAsset\(\s*path\.join\([^)]*onboarding['"]\s*,\s*['"]src['"]/,
      'must not bare fromAsset(onboarding/src)',
    );
    assert.match(t, /wireResultsBucketAccess\(\s*awinOnboardingLive/);
    assert.match(t, /wireResultsBucketAccess\(\s*impactOnboardingLive/);
  });

  it('stage script allowlists awin+impact and copies shared/identity', () => {
    const s = read('scripts/stage-onboarding-lambda-asset.js');
    assert.match(s, /ONBOARDING_FOLDERS/);
    assert.match(s, /providers\/local\/awin\/onboarding/);
    assert.match(s, /providers\/local\/impact\/onboarding/);
    assert.match(s, /shared\/identity\/userId|identity\/userId/);
    assert.match(s, /onboarding-lambda-asset/);
    const product = read('tests/fr132-stage-onboarding-shared.test.js');
    assert.match(product, /runCdkSynth|npm run synth/);
    assert.match(product, /shared\/identity\/userId/);
    assert.match(product, /handler\.handler/);
  });

  it('gitignore covers onboarding + maintainer staged dirs; FR-132 Decision present', () => {
    const gi = read('.gitignore');
    assert.match(gi, /onboarding-lambda-asset/);
    assert.match(gi, /maintainer-lambda-asset/);
    const park = read('docs/fr/FR-132.md');
    assert.match(park, /Decision/);
    assert.match(park, /stage-onboarding-lambda-asset|stageOnboardingLambdaAsset/);
    assert.match(park, /shared\//);
  });
});