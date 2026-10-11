'use strict';

/**
 * FR-164: SQS visibilityTimeout must exceed worker Lambda timeout (6x).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { queueName } = require('../providers/queueName');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const ENABLED_IDS = ['amazon', 'ebay', 'rakuten', 'cj', 'awin', 'impact'];

describe('FR-164 SQS visibilityTimeout > worker Lambda timeout', () => {
  it('stack constants: visibility is 6x worker timeout and wired', () => {
    const {
      WORKER_LAMBDA_TIMEOUT_SEC,
      WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
    } = require('../cdk/lib/a-search-stack');
    assert.equal(WORKER_LAMBDA_TIMEOUT_SEC, 60);
    assert.equal(WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC, 360);
    assert.ok(
      WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC > WORKER_LAMBDA_TIMEOUT_SEC,
      'visibility must exceed timeout',
    );
    assert.equal(
      WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
      WORKER_LAMBDA_TIMEOUT_SEC * 6,
    );

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-164/);
    assert.match(text, /WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC/);
    assert.match(text, /WORKER_LAMBDA_TIMEOUT_SEC/);
  });

  it('synth: each enabled worker queue VisibilityTimeout > function Timeout', () => {
    const cdk = require('aws-cdk-lib');
    const {
      ASearchStack,
      WORKER_LAMBDA_TIMEOUT_SEC,
      WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
    } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr164');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    function findByQueueName(name) {
      const hit = Object.entries(resources).find(([, res]) => {
        return (
          res &&
          res.Type === 'AWS::SQS::Queue' &&
          res.Properties &&
          res.Properties.QueueName === name
        );
      });
      assert.ok(hit, `missing queue ${name}`);
      return hit[1];
    }

    function findWorkerByName(name) {
      const hit = Object.entries(resources).find(([, res]) => {
        return (
          res &&
          res.Type === 'AWS::Lambda::Function' &&
          res.Properties &&
          res.Properties.FunctionName === name
        );
      });
      assert.ok(hit, `missing Lambda ${name}`);
      return hit[1];
    }

    for (const id of ENABLED_IDS) {
      for (const env of ['live', 'sandbox']) {
        const qName = queueName(id, env);
        const fnName = `a-search-${id}-worker-${env}`;
        const queue = findByQueueName(qName);
        const fn = findWorkerByName(fnName);
        const visibility = Number(queue.Properties.VisibilityTimeout);
        const timeout = Number(fn.Properties.Timeout);
        assert.equal(
          timeout,
          WORKER_LAMBDA_TIMEOUT_SEC,
          `${fnName} Timeout`,
        );
        assert.equal(
          visibility,
          WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC,
          `${qName} VisibilityTimeout`,
        );
        assert.ok(
          visibility > timeout,
          `${qName} visibility ${visibility} must exceed ${fnName} timeout ${timeout}`,
        );
      }
    }
  });

  it('FR-164 Decision LOCKED + release-gap Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-164.md'), 'utf8');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr164-sqs-visibility-timeout\.test\.js/);
    assert.match(fr, /WORKER_QUEUE_VISIBILITY_TIMEOUT_SEC|\*\s*6|360/);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(fr),
      'FR-164.md must be ASCII',
    );

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /visibilityTimeout <= worker timeout[^\n]*FR-164[^\n]*\*\*Yes\*\*/i,
    );
  });
});
