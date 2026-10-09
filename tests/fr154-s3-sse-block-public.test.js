'use strict';

/**
 * FR-154: ResultsBucket security defaults — BlockPublicAccess, SSE-S3,
 * enforceSSL, BucketOwnerEnforced (no public ACL). Cross-links FR-129/130.
 * Customer-managed KMS is out of scope.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-154 S3 results bucket SSE + BlockPublicAccess', () => {
  it('stack source deepens ResultsBucket security props (FR-129/130 cross-link)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-154/);
    assert.match(text, /FR-129/);
    assert.match(text, /FR-130/);
    assert.match(text, /ResultsBucket/);
    assert.match(text, /BlockPublicAccess\.BLOCK_ALL/);
    assert.match(text, /BucketEncryption\.S3_MANAGED/);
    assert.match(text, /enforceSSL:\s*true/);
    assert.match(
      text,
      /ObjectOwnership\.BUCKET_OWNER_ENFORCED|objectOwnership:\s*s3\.ObjectOwnership\.BUCKET_OWNER_ENFORCED/,
    );
    assert.match(text, /publicReadAccess:\s*false/);
    assert.doesNotMatch(
      text,
      /BucketEncryption\.KMS(?!_MANAGED)|encryptionKey:\s*/,
      'customer-managed KMS is OOS for FR-154',
    );
  });

  it('synth: ResultsBucket has BPA all-block, AES256 SSE, no public ACL', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr154');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    const bucketEntries = Object.entries(resources).filter(
      ([, res]) => res && res.Type === 'AWS::S3::Bucket',
    );
    assert.ok(bucketEntries.length >= 1, 'expected AWS::S3::Bucket');

    // Prefer the logical id that looks like ResultsBucket
    let bucket =
      bucketEntries.find(([id]) => /ResultsBucket/i.test(id)) ||
      bucketEntries[0];
    const props = bucket[1].Properties || {};

    const pab = props.PublicAccessBlockConfiguration;
    assert.ok(pab, 'PublicAccessBlockConfiguration required');
    assert.equal(pab.BlockPublicAcls, true);
    assert.equal(pab.BlockPublicPolicy, true);
    assert.equal(pab.IgnorePublicAcls, true);
    assert.equal(pab.RestrictPublicBuckets, true);

    const enc = props.BucketEncryption;
    assert.ok(enc && enc.ServerSideEncryptionConfiguration, 'SSE required');
    const rules = enc.ServerSideEncryptionConfiguration;
    assert.ok(Array.isArray(rules) && rules.length >= 1);
    const algo =
      rules[0].ServerSideEncryptionByDefault &&
      rules[0].ServerSideEncryptionByDefault.SSEAlgorithm;
    assert.equal(
      algo,
      'AES256',
      `expected SSE-S3 AES256, got ${algo}`,
    );

    assert.equal(
      props.OwnershipControls &&
        props.OwnershipControls.Rules &&
        props.OwnershipControls.Rules[0] &&
        props.OwnershipControls.Rules[0].ObjectOwnership,
      'BucketOwnerEnforced',
      'ObjectOwnership must be BucketOwnerEnforced (no ACLs)',
    );

    assert.ok(
      props.AccessControl == null ||
        String(props.AccessControl).toLowerCase() !== 'publicread',
      'must not set PublicRead ACL',
    );

    // enforceSSL adds a bucket policy Deny on non-HTTPS
    const policies = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::S3::BucketPolicy',
    );
    assert.ok(policies.length >= 1, 'enforceSSL should emit BucketPolicy');
    const policyJson = JSON.stringify(policies);
    assert.match(policyJson, /aws:SecureTransport|SecureTransport/);
  });
});
