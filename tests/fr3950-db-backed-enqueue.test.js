'use strict';

/**
 * FR-3950: entry enqueues kind:local (DB-backed) work to the single SQS queue;
 * kind:live fan-out stays on per-source queues. No MSSQL on the search path.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { fanOutEnqueue, buildPayload } = require('../entry/src/enqueue');
const { createSqsSendMessage } = require('../entry/src/sqsSend');
const {
  DB_BACKED_QUEUE_ENV,
  isDbBackedSource,
} = require('../entry/src/dbBackedQueue');

const ROOT = path.join(__dirname, '..');

describe('FR-3950 DB-backed single-queue enqueue', () => {
  it('exports SQS_DB_BACKED_URL constant and classifies registry kinds', () => {
    assert.equal(DB_BACKED_QUEUE_ENV, 'SQS_DB_BACKED_URL');
    assert.equal(isDbBackedSource({ kind: 'local' }), true);
    assert.equal(isDbBackedSource({ kind: 'live' }), false);
    assert.equal(isDbBackedSource(null), false);
  });

  it('mock SQS: local sources share SQS_DB_BACKED_* URL; live keep per-source', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const fakeClient = {
      send: async (cmd) => {
        sent.push(cmd.input);
        return {};
      },
    };
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db-backed-live',
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon-live',
        SQS_AWIN_LIVE_URL: 'https://sqs.example/awin-live-should-not-win',
      },
      sqsClient: fakeClient,
      SendMessageCommand: FakeSendMessageCommand,
      loadRegistry: () => ({
        sources: [
          { id: 'amazon', kind: 'live', awsSearch: true, queueEnv: 'SQS_AMAZON_URL' },
          { id: 'awin', kind: 'local', queueEnv: 'SQS_AWIN_URL' },
          { id: 'shopify', kind: 'local', queueEnv: 'SQS_SHOPIFY_URL' },
        ],
      }),
    });

    const enqueued = await fanOutEnqueue({
      searchId: 'srch_3950',
      userId: 'U3950',
      env: 'live',
      body: {
        q: 'brake pads',
        catalogId: 9,
        category: 'Auto',
        subcategory: 'Brakes',
        searchterms: ['pads'],
      },
      sendMessage,
      enabled: () => ['amazon', 'awin', 'shopify'],
    });

    assert.deepEqual(enqueued.sort(), ['amazon', 'awin', 'shopify'].sort());
    assert.equal(sent.length, 3);

    const bySource = {};
    for (const input of sent) {
      const payload = JSON.parse(input.MessageBody);
      bySource[payload.source] = { queueUrl: input.QueueUrl, payload };
    }

    assert.equal(bySource.amazon.queueUrl, 'https://sqs.example/amazon-live');
    assert.equal(bySource.awin.queueUrl, 'https://sqs.example/db-backed-live');
    assert.equal(bySource.shopify.queueUrl, 'https://sqs.example/db-backed-live');

    for (const id of ['awin', 'shopify']) {
      const p = bySource[id].payload;
      assert.equal(p.searchId, 'srch_3950');
      assert.equal(p.userId, 'U3950');
      assert.equal(p.env, 'live');
      assert.equal(p.catalogId, 9);
      assert.equal(p.category, 'Auto');
      assert.equal(p.subcategory, 'Brakes');
      assert.equal(p.q, 'brake pads');
      assert.deepEqual(p.searchterms, ['pads']);
      assert.equal(p.source, id);
      assert.equal(p.sandbox, false);
      // Walrus drain routes on source; queueName stays per-source logical id.
      assert.equal(p.queueName, `a-search-provider-${id}-live.fifo`);
    }
  });

  it('sandbox prefers SQS_DB_BACKED_SANDBOX_URL for local sources', async () => {
    const sent = [];
    class FakeSendMessageCommand {
      constructor(input) {
        this.input = input;
      }
    }
    const sendMessage = createSqsSendMessage({
      envVars: {
        SQS_DB_BACKED_SANDBOX_URL: 'https://sqs.example/db-backed-sandbox',
      },
      sqsClient: {
        send: async (cmd) => {
          sent.push(cmd.input);
          return {};
        },
      },
      SendMessageCommand: FakeSendMessageCommand,
      loadRegistry: () => ({
        sources: [{ id: 'impact', kind: 'local', queueEnv: 'SQS_IMPACT_URL' }],
      }),
    });

    await fanOutEnqueue({
      searchId: 'srch_sb',
      userId: 'U1',
      env: 'sandbox',
      body: { q: 'x', catalogId: 1, category: 'c', subcategory: 's' },
      sendMessage,
      enabled: () => ['impact'],
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].QueueUrl, 'https://sqs.example/db-backed-sandbox');
    const payload = JSON.parse(sent[0].MessageBody);
    assert.equal(payload.source, 'impact');
    assert.equal(payload.sandbox, true);
  });

  it('buildPayload keeps walrus-compatible fields for a local source', () => {
    const p = buildPayload({
      searchId: 'srch_x',
      userId: 'U1',
      env: 'live',
      body: {
        catalogId: 2,
        category: 'Cat',
        subcategory: 'Sub',
        q: 'q',
        searchterms: ['a'],
      },
      source: 'wix',
    });
    assert.equal(p.source, 'wix');
    assert.equal(p.searchId, 'srch_x');
    assert.equal(p.userId, 'U1');
    assert.equal(p.env, 'live');
    assert.equal(p.catalogId, 2);
    assert.equal(p.q, 'q');
    assert.equal(p.queueName, 'a-search-provider-wix-live.fifo');
  });

  it('search enqueue modules do not open MSSQL', () => {
    for (const rel of [
      'entry/src/enqueue.js',
      'entry/src/sqsSend.js',
      'entry/src/dbBackedQueue.js',
      'entry/src/index.js',
    ]) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.doesNotMatch(text, /\brequire\(['"]mssql['"]\)/);
      assert.doesNotMatch(text, /\bMSSQL_/);
    }
  });
});
