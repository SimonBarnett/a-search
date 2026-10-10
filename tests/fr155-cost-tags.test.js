'use strict';

/**
 * FR-155: CDK cost allocation tags Project=a-search + Env from stage/env context.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const resolvePath = path.join(root, 'cdk', 'lib', 'resolve-cost-tags.js');
const deployPath = path.join(root, 'docs', 'deploy.md');

/**
 * @param {object} resource
 * @param {string} key
 * @returns {string|undefined}
 */
function tagValue(resource, key) {
  const tags = (resource.Properties && resource.Properties.Tags) || [];
  const hit = tags.find((t) => t && t.Key === key);
  return hit ? hit.Value : undefined;
}

describe('FR-155 CDK cost allocation tags', () => {
  it('stack + resolve-cost-tags wire Tags.of Project/Env', () => {
    assert.ok(fs.existsSync(resolvePath));
    const stack = fs.readFileSync(stackPath, 'utf8');
    assert.match(stack, /FR-155/);
    assert.match(stack, /resolveCostTags|Tags\.of/);
    assert.match(stack, /Project/);
    assert.match(stack, /\bEnv\b/);
    const deploy = fs.readFileSync(deployPath, 'utf8');
    assert.match(deploy, /FR-155/);
    assert.match(deploy, /Cost tags|cost allocation/i);
    assert.match(deploy, /-c stage=/);
  });

  it('resolveCostTags: Project fixed; Env from stage/env; default', () => {
    const { resolveCostTags, PROJECT_TAG, DEFAULT_ENV_TAG } = require(
      '../cdk/lib/resolve-cost-tags',
    );
    assert.equal(PROJECT_TAG, 'a-search');
    assert.deepEqual(resolveCostTags({}), {
      Project: 'a-search',
      Env: DEFAULT_ENV_TAG,
    });
    assert.deepEqual(resolveCostTags({ stage: 'prod' }), {
      Project: 'a-search',
      Env: 'prod',
    });
    assert.deepEqual(resolveCostTags({ env: 'staging' }), {
      Project: 'a-search',
      Env: 'staging',
    });
    assert.deepEqual(resolveCostTags({ stage: 'prod', env: 'ignored' }), {
      Project: 'a-search',
      Env: 'prod',
    });
    assert.deepEqual(resolveCostTags({ stage: '  ' }), {
      Project: 'a-search',
      Env: DEFAULT_ENV_TAG,
    });
  });

  it('synth: Lambdas/S3/SQS carry Project=a-search and Env from -c stage', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr155');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({
      outdir,
      context: { stage: 'dev' },
    });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, 'ASearchStack.template.json'), 'utf8'),
    );
    const resources = Object.values(tpl.Resources || {});

    const lambdas = resources.filter(
      (r) => r && r.Type === 'AWS::Lambda::Function',
    );
    assert.ok(lambdas.length >= 1, 'expected Lambda functions');
    for (const fn of lambdas) {
      assert.equal(tagValue(fn, 'Project'), 'a-search', 'Lambda Project tag');
      assert.equal(tagValue(fn, 'Env'), 'dev', 'Lambda Env tag');
    }

    const buckets = resources.filter((r) => r && r.Type === 'AWS::S3::Bucket');
    assert.ok(buckets.length >= 1, 'expected S3 bucket');
    for (const b of buckets) {
      assert.equal(tagValue(b, 'Project'), 'a-search');
      assert.equal(tagValue(b, 'Env'), 'dev');
    }

    const queues = resources.filter((r) => r && r.Type === 'AWS::SQS::Queue');
    assert.ok(queues.length >= 1, 'expected SQS queues');
    for (const q of queues) {
      assert.equal(tagValue(q, 'Project'), 'a-search');
      assert.equal(tagValue(q, 'Env'), 'dev');
    }
  });
});
