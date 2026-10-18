'use strict';

/**
 * FR #4236: reviewer spawn must not block the event loop; SQS visibility
 * must exceed the reviewer timeout; a single ECONNABORTED on the annotation
 * write is retried so the message is deleted once.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const { drainOnce, RECEIVE_VISIBILITY_SEC } = require('../redqueen/src/drain');
const { REVIEWER_TIMEOUT_MS, spawnCollect } = require('../redqueen/src/reviewers');

describe('FR #4236 async reviewer and visibility', () => {
  it('receive visibility is strictly greater than the grok reviewer timeout', () => {
    assert.ok(RECEIVE_VISIBILITY_SEC * 1000 > REVIEWER_TIMEOUT_MS);
    assert.equal(REVIEWER_TIMEOUT_MS, 120000);
    assert.ok(RECEIVE_VISIBILITY_SEC >= 180);
  });

  it('spawnCollect yields the event loop while the child runs', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4236-'));
    const script = path.join(dir, 'sleep.js');
    fs.writeFileSync(
      script,
      'setTimeout(() => process.exit(0), 400);\n',
      'utf8',
    );
    let ticked = false;
    const pending = spawnCollect(process.execPath, [script], { timeout: 5000 });
    await new Promise((resolve) => {
      setTimeout(() => {
        ticked = true;
        resolve();
      }, 40);
    });
    assert.equal(ticked, true);
    const result = await pending;
    assert.equal(result.status, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('slow review plus one ECONNABORTED still annotates once and deletes once', async () => {
    const s3 = createMemoryS3();
    const host = 'slowreview.example.com';
    const createdAt = '2026-10-18T11:00:00.000Z';
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
    const realPut = s3.putObjectAnnotation;
    let aborted = 0;
    let annotationWrites = 0;
    s3.putObjectAnnotation = async (input) => {
      if (aborted === 0) {
        aborted += 1;
        const err = new Error('write ECONNABORTED');
        err.code = 'ECONNABORTED';
        throw err;
      }
      annotationWrites += 1;
      return realPut(input);
    };
    let deleted = 0;
    let heartbeats = 0;
    const visSec = 1;
    const out = await drainOnce({
      queueUrl: 'https://sqs.example/q',
      visibilityTimeoutSeconds: visSec,
      visibilityHeartbeatMs: 80,
      receiveMessage: async (input) => {
        assert.equal(input.VisibilityTimeout, visSec);
        return {
          Messages: [
            {
              MessageId: 'm1',
              ReceiptHandle: 'rh1',
              Body: JSON.stringify({
                hostkey: host,
                host,
                createdAt: '2026-10-18T11:00:00.000Z',
              }),
            },
          ],
        };
      },
      deleteMessage: async () => {
        deleted += 1;
      },
      changeMessageVisibility: async () => {
        heartbeats += 1;
      },
      bucket: 'a-clubs',
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      copyObject: s3.copyObject,
      putObjectAnnotation: s3.putObjectAnnotation,
      getObjectAnnotation: s3.getObjectAnnotation,
      listObjectAnnotations: s3.listObjectAnnotations,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('<html><body><p>Club page</p></body></html>'),
      }),
      reviewHost: async () => {
        await new Promise((resolve) => {
          setTimeout(resolve, 1100);
        });
        return {
          model: 'test',
          summary: 'A flying club',
          intent: 'browse',
          suggestedQueries: ['club'],
        };
      },
      reviewGuid: async () => ({
        model: 'test',
        summary: 'Parts form',
        intent: 'request',
        suggestedQueries: ['parts'],
      }),
    });
    assert.equal(aborted, 1);
    assert.equal(annotationWrites, 1);
    assert.equal(deleted, 1);
    assert.ok(heartbeats >= 1);
    assert.equal(out.actions[0].action, 'host_processed');
  });
});
