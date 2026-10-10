'use strict';

/**
 * FR-162: SQS-managed SSE on live/sandbox worker queues and DLQs.
 * CMK per queue is out of scope.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { queueName } = require('../providers/queueName');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const ENABLED_IDS = ['amazon', 'ebay', 'rakuten', 'cj', 'awin', 'impact'];

/**
 * True when a CFN SQS queue uses SQS-managed SSE (SSE-SQS) or aws/sqs KMS alias.
 * @param {object} props
 */
function hasSqsManagedEncryption(props) {
  if (!props || typeof props !== 'object') return false;
  if (props.SqsManagedSseEnabled === true || props.SqsManagedSseEnabled === 'true') {
    return true;
  }
  const kms = props.KmsMasterKeyId;
  if (kms == null) return false;
  const s = typeof kms === 'string' ? kms : JSON.stringify(kms);
  // SQS_MANAGED historically emitted alias/aws/sqs; reject customer CMK ARNs
  if (/alias\/aws\/sqs/i.test(s)) return true;
  if (/encryptionType/i.test(s) && /SQS/i.test(s)) return true;
  return false;
}

describe('FR-162 SQS-managed SSE on worker queues + DLQs', () => {
  it('stack source wires QueueEncryption.SQS_MANAGED (FR-162)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /FR-162/);
    assert.match(text, /QueueEncryption\.SQS_MANAGED/);
    // both primary and DLQ constructors
    const hits = text.match(/encryption:\s*sqs\.QueueEncryption\.SQS_MANAGED/g) || [];
    assert.ok(
      hits.length >= 2,
      `expected encryption on primary + DLQ, got ${hits.length}`,
    );
  });

  it('synth: every enabled primary + DLQ has SQS-managed encryption', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr162');
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
      return hit[1];
    }

    for (const id of ENABLED_IDS) {
      for (const env of ['live', 'sandbox']) {
        const qName = queueName(id, env);
        const dlqName = `${qName}-dlq`;
        const primary = findQueueByName(qName);
        const dlq = findQueueByName(dlqName);
        assert.ok(
          hasSqsManagedEncryption(primary.Properties),
          `${qName} missing SQS-managed SSE: ${JSON.stringify(primary.Properties).slice(0, 240)}`,
        );
        assert.ok(
          hasSqsManagedEncryption(dlq.Properties),
          `${dlqName} missing SQS-managed SSE: ${JSON.stringify(dlq.Properties).slice(0, 240)}`,
        );
        // No customer CMK ARN (OOS)
        for (const res of [primary, dlq]) {
          const kms = res.Properties && res.Properties.KmsMasterKeyId;
          if (kms == null) continue;
          const s = typeof kms === 'string' ? kms : JSON.stringify(kms);
          assert.ok(
            !/arn:aws:kms:/i.test(s) || /alias\/aws\/sqs/i.test(s),
            `unexpected customer CMK on queue: ${s}`,
          );
        }
      }
    }
  });

  it('FR-162 Decision LOCKED + release-gap Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-162.md'), 'utf8');
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr162-sqs-sse\.test\.js/);
    assert.match(fr, /QueueEncryption\.SQS_MANAGED|SQS_MANAGED|SqsManagedSse/i);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(fr),
      'FR-162.md must be ASCII',
    );

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /SQS SSE[^\n]*FR-162[^\n]*\*\*Yes\*\*/i);
  });
});
