'use strict';

/**
 * FR #4246: drain must receive ONE SQS message at a time so batched receipts
 * do not expire while a slow host+GUID review holds the event loop heartbeat
 * on only the current message.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { drainOnce } = require('../redqueen/src/drain');

const ROOT = path.join(__dirname, '..');
const DRAIN = path.join(ROOT, 'redqueen', 'src', 'drain.js');

describe('FR #4246 drain one message at a time', () => {
  it('default MaxNumberOfMessages is 1 (source pin + receive call)', async () => {
    const src = fs.readFileSync(DRAIN, 'utf8');
    assert.match(src, /DEFAULT_MAX_MESSAGES\s*=\s*1\b/);
    assert.match(
      src,
      /MaxNumberOfMessages:\s*[\s\S]*?opts\.maxMessages\s*==\s*null\s*\?\s*DEFAULT_MAX_MESSAGES/,
    );
    assert.doesNotMatch(src, /MaxNumberOfMessages:\s*opts\.maxMessages\s*\|\|\s*5\b/);

    let seenMax = null;
    await drainOnce({
      queueUrl: 'https://sqs.example/q',
      waitTimeSeconds: 0,
      receiveMessage: async (input) => {
        seenMax = input.MaxNumberOfMessages;
        return { Messages: [] };
      },
      deleteMessage: async () => {},
      bucket: 'a-clubs',
      headObject: async () => {
        throw Object.assign(new Error('none'), { name: 'NotFound' });
      },
      putObject: async () => {},
      putObjectAnnotation: async () => {},
    });
    assert.equal(seenMax, 1);
  });

  it('fake SQS: no receipt used after visibility lapses (batch of 2 + slow review)', async () => {
    const s3 = createMemoryS3();
    const hostA = 'batch-a.example.com';
    const hostB = 'batch-b.example.com';
    const createdAt = '2026-10-18T16:00:00.000Z';
    for (const host of [hostA, hostB]) {
      await s3.putObject({
        Key: hostMarkerKey(host),
        Body: Buffer.alloc(0),
        Metadata: {
          userid: '0123456C',
          host,
          hostkey: host,
          lastmod: createdAt,
          annotated: '0',
        },
      });
    }

    /** @type {Map<string, { expiresAt: number }>} */
    const receipts = new Map();
    let nowMs = 1_000_000;
    const visSec = 2;
    const expiredUses = [];

    function assertLive(handle, op) {
      const row = receipts.get(handle);
      if (!row) {
        expiredUses.push({ handle, op, reason: 'unknown' });
        throw new Error(`ReceiptHandle invalid: unknown ${handle}`);
      }
      if (nowMs >= row.expiresAt) {
        expiredUses.push({ handle, op, reason: 'expired' });
        const err = new Error(
          `Value ${handle} for parameter ReceiptHandle is invalid. Reason: The receipt handle has expired.`,
        );
        err.name = 'ReceiptHandleIsInvalid';
        throw err;
      }
    }

    const queue = [
      {
        MessageId: 'm-a',
        ReceiptHandle: 'rh-a',
        Body: JSON.stringify({
          hostkey: hostA,
          host: hostA,
          createdAt,
        }),
      },
      {
        MessageId: 'm-b',
        ReceiptHandle: 'rh-b',
        Body: JSON.stringify({
          hostkey: hostB,
          host: hostB,
          createdAt,
        }),
      },
    ];

    const receiveMessage = async (input) => {
      const max = input.MaxNumberOfMessages == null ? 1 : input.MaxNumberOfMessages;
      const take = queue.splice(0, max);
      const vis =
        input.VisibilityTimeout == null ? visSec : input.VisibilityTimeout;
      for (const msg of take) {
        receipts.set(msg.ReceiptHandle, {
          expiresAt: nowMs + vis * 1000,
        });
      }
      return { Messages: take };
    };

    const changeMessageVisibility = async (input) => {
      assertLive(input.ReceiptHandle, 'change');
      receipts.set(input.ReceiptHandle, {
        expiresAt: nowMs + input.VisibilityTimeout * 1000,
      });
    };

    const deleteMessage = async (input) => {
      assertLive(input.ReceiptHandle, 'delete');
      receipts.delete(input.ReceiptHandle);
    };

    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        Buffer.from('<html><body><p>Club page</p></body></html>'),
    });

    const reviewHost = async () => {
      // Wall-clock wait longer than one visibility window; heartbeats must
      // keep extending the *current* receipt. With MaxNumberOfMessages=1 the
      // second message is not received until the next drainOnce.
      const steps = 8;
      for (let i = 0; i < steps; i += 1) {
        await new Promise((r) => setTimeout(r, 40));
        nowMs += Math.floor((visSec * 1000 + 400) / steps);
      }
      return {
        model: 'test',
        summary: 'Club',
        intent: 'browse',
        suggestedQueries: ['club'],
      };
    };

    // Default path: one message per drainOnce --- second call still has a live receipt.
    const out1 = await drainOnce({
      queueUrl: 'https://sqs.example/q',
      visibilityTimeoutSeconds: visSec,
      visibilityHeartbeatMs: 20,
      waitTimeSeconds: 0,
      receiveMessage,
      deleteMessage,
      changeMessageVisibility,
      bucket: 'a-clubs',
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      putObjectAnnotation: s3.putObjectAnnotation,
      getObjectAnnotation: s3.getObjectAnnotation,
      listObjectAnnotations: s3.listObjectAnnotations,
      fetchImpl,
      reviewHost,
      reviewGuid: async () => ({
        model: 'test',
        summary: 'GUID',
        intent: 'request',
        suggestedQueries: ['parts'],
      }),
    });
    assert.equal(out1.processed, 1);
    assert.equal(out1.actions[0].action, 'host_processed');

    const out2 = await drainOnce({
      queueUrl: 'https://sqs.example/q',
      visibilityTimeoutSeconds: visSec,
      visibilityHeartbeatMs: 20,
      waitTimeSeconds: 0,
      receiveMessage,
      deleteMessage,
      changeMessageVisibility,
      bucket: 'a-clubs',
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      putObjectAnnotation: s3.putObjectAnnotation,
      getObjectAnnotation: s3.getObjectAnnotation,
      listObjectAnnotations: s3.listObjectAnnotations,
      fetchImpl,
      reviewHost,
      reviewGuid: async () => ({
        model: 'test',
        summary: 'GUID',
        intent: 'request',
        suggestedQueries: ['parts'],
      }),
    });
    assert.equal(out2.processed, 1);
    assert.equal(out2.actions[0].action, 'host_processed');
    assert.equal(expiredUses.length, 0, JSON.stringify(expiredUses));
    assert.equal(queue.length, 0);
  });

  it('docs mention one-message receive / receipt expiry', () => {
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(docs, /MaxNumberOfMessages|one message|receipt handle/i);
    assert.match(docs, /4246|#4246|FR #4246/);
  });
});
