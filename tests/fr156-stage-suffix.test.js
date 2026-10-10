'use strict';

/**
 * FR-156: optional -c stage= suffix on function/queue/bucket-related names
 * and ASearchStack id. Default (empty stage) keeps production names.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const binPath = path.join(root, 'cdk', 'bin', 'a-search.js');
const resolvePath = path.join(root, 'cdk', 'lib', 'resolve-stage-suffix.js');
const deployPath = path.join(root, 'docs', 'deploy.md');

/**
 * @param {object} tpl
 * @param {string} type
 * @returns {object[]}
 */
function resourcesOfType(tpl, type) {
  return Object.values(tpl.Resources || {}).filter(
    (r) => r && r.Type === type,
  );
}

describe('FR-156 stack stage suffix', () => {
  it('helper + stack/bin/deploy wire -c stage suffix', () => {
    assert.ok(fs.existsSync(resolvePath));
    const stack = fs.readFileSync(stackPath, 'utf8');
    assert.match(stack, /FR-156/);
    assert.match(stack, /resolveStageSuffix|withStageSuffix/);
    const bin = fs.readFileSync(binPath, 'utf8');
    assert.match(bin, /resolveStackId|FR-156/);
    const deploy = fs.readFileSync(deployPath, 'utf8');
    assert.match(deploy, /FR-156/);
    assert.match(deploy, /-c stage=/);
  });

  it('resolveStageSuffix / resolveStackId / withStageSuffix', () => {
    const {
      resolveStageSuffix,
      withStageSuffix,
      resolveStackId,
    } = require('../cdk/lib/resolve-stage-suffix');
    assert.equal(resolveStageSuffix({}), '');
    assert.equal(resolveStageSuffix({ stage: undefined }), '');
    assert.equal(resolveStageSuffix({ stage: '  ' }), '');
    assert.equal(resolveStageSuffix({ stage: 'dev' }), '-dev');
    assert.equal(resolveStageSuffix({ stage: 'Dev' }), '-dev');
    assert.equal(resolveStageSuffix({ stage: 'qa-1' }), '-qa-1');
    assert.throws(() => resolveStageSuffix({ stage: 'Bad_Stage' }), /FR-156/);
    assert.throws(() => resolveStageSuffix({ stage: '-dev' }), /FR-156/);
    assert.equal(withStageSuffix('a-search-entry', ''), 'a-search-entry');
    assert.equal(withStageSuffix('a-search-entry', '-dev'), 'a-search-entry-dev');
    assert.equal(resolveStackId({}), 'ASearchStack');
    assert.equal(resolveStackId({ stage: 'dev' }), 'ASearchStack-dev');
  });

  it('synth without stage: default physical names unchanged', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr156-default');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();
    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, 'ASearchStack.template.json'), 'utf8'),
    );
    const entry = resourcesOfType(tpl, 'AWS::Lambda::Function').find(
      (r) =>
        r.Properties && r.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'default synth must keep functionName a-search-entry');
    const queues = resourcesOfType(tpl, 'AWS::SQS::Queue').map(
      (r) => r.Properties && r.Properties.QueueName,
    );
    assert.ok(queues.includes('a-search-amazon-live'));
    assert.ok(queues.includes('a-search-amazon-live-dlq'));
    assert.ok(!queues.some((n) => typeof n === 'string' && n.endsWith('-dev')));
  });

  it('synth with -c stage=dev: names and stack id take -dev suffix', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const { resolveStackId } = require('../cdk/lib/resolve-stage-suffix');
    const outdir = path.join(root, 'cdk.out-fr156-dev');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir, context: { stage: 'dev' } });
    const stackId = resolveStackId({ stage: 'dev' });
    assert.equal(stackId, 'ASearchStack-dev');
    new ASearchStack(app, stackId);
    app.synth();
    const tpl = JSON.parse(
      fs.readFileSync(path.join(outdir, `${stackId}.template.json`), 'utf8'),
    );
    const fnNames = resourcesOfType(tpl, 'AWS::Lambda::Function').map(
      (r) => r.Properties && r.Properties.FunctionName,
    );
    assert.ok(fnNames.includes('a-search-entry-dev'));
    assert.ok(fnNames.includes('a-search-amazon-worker-live-dev'));
    assert.ok(!fnNames.includes('a-search-entry'));
    const queues = resourcesOfType(tpl, 'AWS::SQS::Queue').map(
      (r) => r.Properties && r.Properties.QueueName,
    );
    assert.ok(queues.includes('a-search-amazon-live-dev'));
    assert.ok(queues.includes('a-search-amazon-live-dev-dlq'));
  });
});
