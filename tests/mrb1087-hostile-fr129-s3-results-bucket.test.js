'use strict';

/** docs/mrb-1087: hostile pins for FR-129 CDK ResultsBucket (PR #1087). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const productTest = path.join(root, 'tests', 'fr129-s3-results-bucket.test.js');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('MRB #1087 hostile FR-129 ResultsBucket', () => {
  it('stack ResultsBucket: BLOCK_ALL, S3_MANAGED, RETAIN; no hard-coded bucket name', () => {
    const t = fs.readFileSync(stackPath, 'utf8');
    assert.match(t, /aws-cdk-lib\/aws-s3|aws-s3/);
    assert.match(t, /ResultsBucket/);
    assert.match(t, /BlockPublicAccess\.BLOCK_ALL/);
    assert.match(t, /BucketEncryption\.S3_MANAGED|encryption:\s*s3\.BucketEncryption/);
    assert.match(t, /RemovalPolicy\.RETAIN/);
    assert.match(t, /ResultsBucketName/);
    assert.match(t, /ResultsBucketArn/);
    assert.match(t, /FR-124|live\/|sandbox\//);
    assert.doesNotMatch(t, /bucketName:\s*['"]/);
    assert.doesNotMatch(t, /madeira-results-bucket/);
    assert.doesNotMatch(t, /grantPut|grantReadWrite|addToRolePolicy/);
    assert.doesNotMatch(
      t,
      /addEnvironment\(\s*['"]S3_RESULTS_BUCKET['"]/,
    );
  });

  it('FR-129 park Decision LOCKED; IAM deferred to FR-130', () => {
    const park = read('docs/fr/FR-129.md');
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /ResultsBucket/);
    assert.match(park, /FR-130/);
    assert.match(park, /BLOCK_ALL|BlockPublicAccess/);
  });

  it('product fr129 synth pin remains on main', () => {
    assert.ok(fs.existsSync(productTest));
    const t = fs.readFileSync(productTest, 'utf8');
    assert.match(t, /runCdkSynth|npm run synth/);
    assert.match(t, /AWS::S3::Bucket/);
    assert.match(t, /ResultsBucketName/);
    assert.match(t, /ResultsBucketArn/);
    assert.match(t, /FR-130/);
  });
});
