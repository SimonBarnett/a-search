'use strict';

/**
 * FR #4827: dual queue drain, WaitTimeSeconds 20, no sleep after an empty long-poll.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { drainOnce, drainDual, DEFAULT_WAIT_TIME_SECONDS } = require('../redqueen/src/drain');
const { serviceLoop, DEFAULT_SWEEP_MS } = require('../redqueen/src/run');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('FR #4827 dual drain', () => {
  it('defaults WaitTimeSeconds to 20 and routes EventBridge bodies to the change handler', async () => {
    assert.equal(DEFAULT_WAIT_TIME_SECONDS, 20);
    const received = [];
    const deleted = [];
    const folders = [];
    const out = await drainDual({
      queueUrl: 'https://sqs.example/folders.fifo',
      changesQueueUrl: 'https://sqs.example/changes',
      receiveMessage: async (input) => {
        received.push(input);
        if (input.QueueUrl.indexOf('folders') !== -1) {
          return {
            Messages: [
              {
                MessageId: 'f1',
                ReceiptHandle: 'rf',
                Body: JSON.stringify({
                  hostkey: 'mmfc.example',
                  host: 'mmfc.example',
                  createdAt: '2026-10-24T00:00:00.000Z',
                }),
              },
            ],
          };
        }
        return {
          Messages: [
            {
              MessageId: 'c1',
              ReceiptHandle: 'rc',
              Body: JSON.stringify({
                source: 'aws.s3',
                detail: {
                  object: { key: `mmfc.example/${GUID}/IN/x.json`, etag: 'e' },
                },
              }),
            },
            {
              MessageId: 'c2',
              ReceiptHandle: 'rc2',
              Body: JSON.stringify({
                source: 'aws.s3',
                detail: { object: { key: `mmfc.example/${GUID}/widget.json`, etag: 'w' } },
              }),
            },
          ],
        };
      },
      deleteMessage: async (input) => {
        deleted.push(input.ReceiptHandle);
      },
      headObject: async () => {
        throw Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
      },
      putObject: async () => ({}),
      putObjectAnnotation: async () => ({}),
      processFolderEvent: async (opts) => {
        folders.push(opts.event || opts.body);
        return { action: 'host_processed', guids: [] };
      },
      maxMessages: 10,
    });
    assert.equal(received.length, 2);
    assert.equal(received[0].WaitTimeSeconds, 20);
    assert.equal(received[1].WaitTimeSeconds, 20);
    assert.equal(folders.length, 1);
    assert.equal(folders[0].hostkey, 'mmfc.example');
    assert.ok(deleted.indexOf('rc') !== -1);
    assert.ok(deleted.indexOf('rc2') !== -1);
    const folderAction = out.actions.find((a) => a.messageId === 'f1');
    assert.equal(folderAction.action, 'retry');
    assert.equal(folderAction.detail, 'host_marker_missing');
    assert.equal(deleted.indexOf('rf'), -1);
  });

  it('drainOnce still accepts a single folder queue', async () => {
    const seen = [];
    const result = await drainOnce({
      queueUrl: 'https://sqs.example/one',
      waitTimeSeconds: 0,
      receiveMessage: async (input) => {
        seen.push(input.WaitTimeSeconds);
        return { Messages: [] };
      },
      deleteMessage: async () => {},
      headObject: async () => ({}),
      putObject: async () => ({}),
      putObjectAnnotation: async () => ({}),
    });
    assert.equal(result.processed, 0);
    assert.equal(seen[0], 0);
  });

  it('service loop sweeps at startup and does not sleep after an empty poll', async () => {
    assert.equal(DEFAULT_SWEEP_MS, 900000);
    const sweeps = [];
    const sleeps = [];
    let t = 1000;
    const empty = await serviceLoop(
      {},
      {
        maxLoops: 2,
        sweepMs: 100,
        now: () => t,
        drain: async () => {
          t += 150;
          return { processed: 0, actions: [] };
        },
        sweep: async () => {
          sweeps.push(t);
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        log: () => {},
      },
    );
    assert.equal(empty.loops, 2);
    assert.equal(sleeps.length, 0);
    assert.ok(sweeps.length >= 2);

    const sleepsOnError = [];
    await serviceLoop(
      {},
      {
        maxLoops: 1,
        errorSleepMs: 25,
        drain: async () => {
          throw new Error('socket');
        },
        sweep: async () => {},
        sleep: async (ms) => {
          sleepsOnError.push(ms);
        },
        log: () => {},
      },
    );
    assert.deepEqual(sleepsOnError, [25]);
  });
});
