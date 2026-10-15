'use strict';

/**
 * #1343 Agentic Searches: EventBridge suffixes, FIFO grouping, idle zero-tokens, DLQ.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  classifyS3Key,
  messageGroupId,
  messageDeduplicationId,
  buildQueueMessage,
  fifoSendParamsFromS3,
  NON_TRIGGER_BASENAMES,
} = require('../shared/widgets/agentQueue');
const { createFakeFifoQueue } = require('../components-piece/dispatcher/src/fakeQueue');
const { createDispatcher } = require('../components-piece/dispatcher/src/dispatcher');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('#1343 Agentic Searches dispatch', () => {
  it('classifies only the four S3 trigger suffixes', () => {
    const host = classifyS3Key('sandbox/x/42/_host.json');
    assert.equal(host.eventType, 'host_created');
    assert.equal(host.customerNumber, '42');
    assert.equal(host.widgetGuid, null);

    const w = classifyS3Key(`live/x/7/${GUID}/widget.json`);
    assert.equal(w.eventType, 'widget_created');
    assert.equal(w.widgetGuid, GUID);

    assert.equal(
      classifyS3Key(`sandbox/x/7/${GUID}/feedback.json`).eventType,
      'widget_feedback',
    );
    assert.equal(
      classifyS3Key(`sandbox/x/7/${GUID}/in.json`).eventType,
      'in_ready',
    );

    for (const name of NON_TRIGGER_BASENAMES) {
      assert.equal(
        classifyS3Key(`sandbox/x/7/${GUID}/${name}`),
        null,
        name + ' must not trigger',
      );
    }
    assert.equal(classifyS3Key('sandbox/x/7/site.md'), null);
  });

  it('builds FIFO MessageGroupId per widget and host', () => {
    assert.equal(
      messageGroupId({
        eventType: 'host_created',
        env: 'sandbox',
        customerNumber: '42',
      }),
      'sandbox/42/_host',
    );
    assert.equal(
      messageGroupId({
        eventType: 'in_ready',
        env: 'live',
        customerNumber: '7',
        widgetGuid: GUID,
      }),
      'live/7/' + GUID,
    );
  });

  it('fifoSendParamsFromS3 sets body + group + dedup', () => {
    const p = fifoSendParamsFromS3(`sandbox/x/9/${GUID}/in.json`, 'seq99');
    assert.ok(p);
    assert.equal(p.MessageGroupId, 'sandbox/9/' + GUID);
    assert.match(p.MessageDeduplicationId, /^in_ready:sandbox\/x\/9\//);
    const body = JSON.parse(p.MessageBody);
    assert.equal(body.eventType, 'in_ready');
    assert.equal(body.env, 'sandbox');
    assert.equal(body.widgetGuid, GUID);
    assert.equal(body.host, null);
  });

  it('FIFO: two events same widgetGuid never concurrent; DLQ after 5 fails', async () => {
    const q = createFakeFifoQueue({ maxReceiveCount: 5 });
    const llm = { tokensUsed: 0, calls: 0 };
    const mount = { reads: 0, writes: 0 };
    let runs = 0;
    const stubPass = async () => {
      runs += 1;
      return { status: { result: 'ok' } };
    };
    // failing runner for DLQ path tested separately below
    const dispatcher = createDispatcher({
      queue: q,
      poolSize: 2,
      llm,
      mount,
      root: '',
      passes: {
        host: () => ({ ok: true }),
        widgetContext: () => ({ ok: true }),
        ingest: () => ({ partsCount: 0 }),
        prune: () => ({ ok: true }),
        sweep: () => ({ ok: true }),
      },
      resolveTier: () => ({ upgraded: false, layout: 'horizontal' }),
    });
    // override pool run to count concurrent
    const body1 = buildQueueMessage({
      eventType: 'in_ready',
      env: 'sandbox',
      customerNumber: '1',
      widgetGuid: GUID,
      s3Key: `sandbox/x/1/${GUID}/in.json`,
    });
    const body2 = buildQueueMessage({
      eventType: 'widget_feedback',
      env: 'sandbox',
      customerNumber: '1',
      widgetGuid: GUID,
      s3Key: `sandbox/x/1/${GUID}/feedback.json`,
    });
    q.send({
      MessageBody: JSON.stringify(body1),
      MessageGroupId: messageGroupId(body1),
      MessageDeduplicationId: messageDeduplicationId({
        ...body1,
        sequencer: '1',
      }),
    });
    q.send({
      MessageBody: JSON.stringify(body2),
      MessageGroupId: messageGroupId(body2),
      MessageDeduplicationId: messageDeduplicationId({
        ...body2,
        sequencer: '2',
      }),
    });
    const first = q.receive(2);
    assert.equal(first.length, 1, 'only one in-flight per group');
    assert.equal(q.receive(1).length, 0, 'second blocked while in-flight');
    q.deleteMessage(first[0].ReceiptHandle);
    const second = q.receive(1);
    assert.equal(second.length, 1);

    // DLQ
    const q2 = createFakeFifoQueue({ maxReceiveCount: 5 });
    const failBody = buildQueueMessage({
      eventType: 'host_created',
      env: 'sandbox',
      customerNumber: '99',
      widgetGuid: null,
      s3Key: 'sandbox/x/99/_host.json',
    });
    q2.send({
      MessageBody: JSON.stringify(failBody),
      MessageGroupId: messageGroupId(failBody),
      MessageDeduplicationId: 'fail-dedup-1',
    });
    for (let i = 0; i < 5; i++) {
      const m = q2.receive(1)[0];
      assert.ok(m);
      q2.failMessage(m.ReceiptHandle);
    }
    assert.equal(q2.dlq().length, 1);
    assert.equal(q2.receive(1).length, 0);
  });

  it('idle: empty queue keeps tokens at 0 and no mount reads', async () => {
    const q = createFakeFifoQueue({ maxReceiveCount: 5 });
    const llm = { tokensUsed: 0, calls: 0 };
    const mount = { reads: 0, writes: 0 };
    const dispatcher = createDispatcher({
      queue: q,
      poolSize: 2,
      llm,
      mount,
      root: '',
      passes: {
        host: () => {
          throw new Error('should_not_run');
        },
      },
    });
    for (let i = 0; i < 10; i++) {
      const r = await dispatcher.processOnce();
      assert.equal(r.empty, true);
    }
    assert.equal(llm.tokensUsed, 0);
    assert.equal(llm.calls, 0);
    assert.equal(mount.reads, 0);
    assert.equal(mount.writes, 0);
  });

  it('dispatcher deletes message only after ok; writes last-run.json', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-1343-'));
    try {
      const q = createFakeFifoQueue({ maxReceiveCount: 5 });
      const llm = { tokensUsed: 0, calls: 0 };
      const mount = { reads: 0, writes: 0 };
      const dispatcher = createDispatcher({
        queue: q,
        poolSize: 1,
        llm,
        mount,
        root,
        passes: {
          host: (opts) => {
            const dir = path.join(root, opts.env, 'x', String(opts.customerNumber));
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'site.md'), '# site\n', 'utf8');
            return { siteMdCreated: true };
          },
          widgetContext: () => ({ ok: true }),
          ingest: () => ({ partsCount: 0 }),
          prune: () => ({ ok: true }),
          sweep: () => ({ ok: true }),
        },
      });
      const body = buildQueueMessage({
        eventType: 'host_created',
        env: 'sandbox',
        customerNumber: '55',
        widgetGuid: null,
        host: 'shop.example',
        s3Key: 'sandbox/x/55/_host.json',
      });
      q.send({
        MessageBody: JSON.stringify(body),
        MessageGroupId: messageGroupId(body),
        MessageDeduplicationId: 'host-55-1',
      });
      const r = await dispatcher.processOnce();
      assert.equal(r.ok, true);
      assert.equal(q.pending().length, 0);
      assert.equal(q.inFlight().size, 0);
      assert.ok(llm.tokensUsed > 0);
      const lastRun = path.join(
        root,
        'sandbox',
        'x',
        '55',
        '_agent',
        'last-run.json',
      );
      assert.ok(fs.existsSync(lastRun));
      const status = JSON.parse(fs.readFileSync(lastRun, 'utf8'));
      assert.equal(status.eventType, 'host_created');
      assert.equal(status.result, 'ok');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('CDK stack source pins FIFO queue + EventBridge enable + four suffixes', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /a-search-widget-agent\.fifo/);
    assert.match(stack, /fifo:\s*true/);
    assert.match(stack, /contentBasedDeduplication:\s*false/);
    assert.match(stack, /maxReceiveCount:\s*5/);
    assert.match(stack, /eventBridgeEnabled:\s*true/);
    assert.match(stack, /_host\.json/);
    assert.match(stack, /widget\.json/);
    assert.match(stack, /feedback\.json/);
    assert.match(stack, /\/in\.json|in\.json/);
    assert.match(stack, /AGENT_JOB_TIMEOUT_S|900/);
    assert.doesNotMatch(stack, /stats_changed/);
  });

  it('docs describe event flow queue wrapper rclone', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'components-piece-agent-dispatch.md'),
      'utf8',
    );
    assert.match(doc, /EventBridge/);
    assert.match(doc, /a-search-widget-agent\.fifo/);
    assert.match(doc, /MessageGroupId/);
    assert.match(doc, /idle/i);
    assert.match(doc, /rclone/i);
    assert.match(doc, /last-run\.json/);
    assert.match(doc, /no `stats_changed` event/);
  });
});