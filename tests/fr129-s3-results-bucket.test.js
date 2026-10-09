'use strict';

/**
 * FR-129: CDK S3 results bucket + ResultsBucketName/Arn outputs (no IAM yet).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-129 CDK S3 results bucket', () => {
  it('stack source declares ResultsBucket + outputs (no IAM grants yet)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /aws-s3|aws_s3/);
    assert.match(text, /ResultsBucket/);
    assert.match(text, /ResultsBucketName/);
    assert.match(text, /ResultsBucketArn/);
    assert.match(text, /BlockPublicAccess|blockPublicAccess/);
    // FR-130 owns env + IAM — this tip must not grant PutObject yet.
    assert.doesNotMatch(
      text,
      /grantPut|grantReadWrite|addToRolePolicy/,
      'FR-129 must not add IAM grants (FR-130)',
    );
    assert.doesNotMatch(
      text,
      /addEnvironment\(\s*['"]S3_RESULTS_BUCKET['"]/,
      'FR-129 must not set S3_RESULTS_BUCKET on Lambda env (FR-130)',
    );
  });

  it('npm run synth emits AWS::S3::Bucket + ResultsBucket outputs', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(
      root,
      'cdk.out',
      'ASearchStack.template.json',
    );
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};
    const buckets = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::S3::Bucket',
    );
    assert.ok(buckets.length >= 1, 'template must include AWS::S3::Bucket');
    const outputs = tpl.Outputs || {};
    assert.ok(outputs.ResultsBucketName, 'missing Outputs.ResultsBucketName');
    assert.ok(outputs.ResultsBucketArn, 'missing Outputs.ResultsBucketArn');
  });
});
