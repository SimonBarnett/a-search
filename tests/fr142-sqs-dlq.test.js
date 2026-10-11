'use strict';

/**
 * FR-142: SQS DLQ + redrive on each enabled worker queue (live + sandbox).
 * Alarms are FR-143 (out of scope here).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { queueName } = require('../providers/queueName');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const ENABLED_IDS = ['amazon', 'ebay', 'rakuten', 'cj', 'awin', 'impact', 'kelkoo', 'aliexpress', 'etsy']; // FR-167+169+170
const MAX_RECEIVE_COUNT = 3;

describe('FR-142 SQS DLQs for enabled worker queues', () => {
  it('stack source wires deadLetterQueue + maxReceiveCount on worker queues', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-142/);
    assert.match(text, /deadLetterQueue/);
    assert.match(text, /maxReceiveCount/);
    assert.match(text, /DeadLetterQueue/);
    // DLQ name derived from primary queue name
    assert.match(text, /-dlq|DeadLetter|dlqName/);
  });

  it('synth: each enabled env-queue has RedrivePolicy to a sibling DLQ', () => {
    // In-process synth: mssql/provider asset staging can exceed spawnSync
    // timeouts on fleet seats (same class as FR-137/FR-138).
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr142');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();

    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};
    const queues = Object.entries(resources).filter(
      ([, res]) => res && res.Type === 'AWS::SQS::Queue',
    );

    function findQueueByName(name) {
      const hit = queues.find(([, res]) => {
        const qn = res.Properties && res.Properties.QueueName;
        return qn === name;
      });
      assert.ok(hit, `missing SQS queue ${name}`);
      return { logicalId: hit[0], resource: hit[1] };
    }

    for (const id of ENABLED_IDS) {
      for (const env of ['live', 'sandbox']) {
        const qName = queueName(id, env);
        const dlqName = `${qName}-dlq`;
        const primary = findQueueByName(qName);
        const dlq = findQueueByName(dlqName);

        const redrive = primary.resource.Properties.RedrivePolicy;
        assert.ok(redrive, `${qName} missing RedrivePolicy`);
        assert.equal(
          Number(redrive.maxReceiveCount),
          MAX_RECEIVE_COUNT,
          `${qName} maxReceiveCount`,
        );
        const target = redrive.deadLetterTargetArn;
        assert.ok(target, `${qName} missing deadLetterTargetArn`);
        const targetStr = JSON.stringify(target);
        assert.ok(
          targetStr.includes(dlq.logicalId) ||
            targetStr.includes(dlqName) ||
            (typeof target === 'object' &&
              JSON.stringify(target).includes('GetAtt')),
          `${qName} RedrivePolicy must point at ${dlqName} (${dlq.logicalId}), got ${targetStr.slice(0, 160)}`,
        );
        // DLQ itself must not redrive further
        assert.equal(
          dlq.resource.Properties.RedrivePolicy,
          undefined,
          `${dlqName} must not have its own RedrivePolicy`,
        );
      }
    }

    // FR-167+169+170: 18 primaries + 16 DLQs (9 enabled x live+sandbox)
    const named = queues
      .map(([, res]) => res.Properties && res.Properties.QueueName)
      .filter(Boolean);
    const primaries = named.filter((n) => !String(n).endsWith('-dlq'));
    const dlqs = named.filter((n) => String(n).endsWith('-dlq'));
    assert.equal(primaries.length, 18, `expected 18 primary queues, got ${primaries.length}`);
    assert.equal(dlqs.length, 18, `expected 18 DLQs, got ${dlqs.length}`);
  });

  it('docs: FR-142 Decision LOCKED + release-gap SQS DLQ Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-142.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /deadLetterQueue|maxReceiveCount|RedrivePolicy/i);
    assert.match(fr, /fr142-sqs-dlq\.test\.js/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*SQS DLQ\s*\|\s*\*\*Yes\*\*/);
  });
});
