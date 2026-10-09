'use strict';

/** docs/mrb-1092: hostile pins for FR-130 S3_RESULTS_BUCKET + IAM (PR #1092). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1092 hostile FR-130 S3_RESULTS_BUCKET', () => {
  it('wireResultsBucketAccess sets S3_RESULTS_BUCKET and grantReadWrite', () => {
    const t = fs.readFileSync(stackPath, 'utf8');
    assert.match(t, /function wireResultsBucketAccess/);
    assert.match(t, /addEnvironment\(\s*['"]S3_RESULTS_BUCKET['"]/);
    assert.match(t, /grantReadWrite\(/);
    assert.match(t, /wireResultsBucketAccess\(\s*entry/);
    assert.match(t, /wireResultsBucketAccess\(\s*worker/);
    assert.match(t, /wireResultsBucketAccess\(\s*maintainerLive/);
    assert.match(t, /wireResultsBucketAccess\(\s*maintainerSandbox/);
    assert.match(t, /wireResultsBucketAccess\(\s*awinOnboardingLive/);
    assert.match(t, /wireResultsBucketAccess\(\s*awinOnboardingSandbox/);
    assert.match(t, /wireResultsBucketAccess\(\s*impactOnboardingSandbox/);
    assert.match(t, /wireResultsBucketAccess\(\s*impactOnboardingLive/);
    assert.match(t, /module\.exports[\s\S]*wireResultsBucketAccess/);
  });

  it('FR-130 park Decision LOCKED; product fr130 synth pin present', () => {
    const park = read('docs/fr/FR-130.md');
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /wireResultsBucketAccess/);
    assert.match(park, /S3_RESULTS_BUCKET/);
    assert.match(park, /grantReadWrite/);
    const product = read('tests/fr130-s3-results-env.test.js');
    assert.match(product, /runCdkSynth/);
    assert.match(product, /S3_RESULTS_BUCKET/);
    assert.match(product, /Resource \*/);
    assert.match(product, /PutObject|GetObject/);
  });

  it('mrb1087 no longer forbids FR-130 IAM on the shared stack file', () => {
    const h = read('tests/mrb1087-hostile-fr129-s3-results-bucket.test.js');
    assert.ok(
      !/doesNotMatch\(\s*t,\s*\/grantPut\|grantReadWrite/.test(h),
      'mrb1087 must not still forbid grantReadWrite after FR-130',
    );
    assert.ok(
      !/doesNotMatch\(\s*t,\s*\/addEnvironment\(\s*\\s\*\[.']S3_RESULTS_BUCKET/.test(h),
      'mrb1087 must not still forbid S3_RESULTS_BUCKET after FR-130',
    );
  });
});