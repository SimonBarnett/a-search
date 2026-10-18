'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFolderEvent,
  buildFolderEvent,
  messageGroupId,
  messageDeduplicationId,
} = require('../shared/aClubs/folderEvents');
const { resolvePageUri } = require('../parts-gateway/src/pageUri');
const { publishFolderEvent } = require('../parts-gateway/src/publishFolderEvent');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { ensureAclubsHost } = require('../parts-gateway/src/ensureHost');
const { ensureAclubsWidget } = require('../parts-gateway/src/ensureWidget');
const {
  processFolderEvent,
  annotationNeed,
  hostAnnotationsKey,
  guidAnnotationsKey,
} = require('../redqueen/src/annotate');
const { drainOnce } = require('../redqueen/src/drain');
const { widgetFileKey, hostMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const {
  mintChecksummedUserId,
} = require('../shared/identity/madeiraUserId');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GUID2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FIXED_NOW = () => new Date('2026-10-18T12:00:00.000Z');

describe('FR #3987 folder event schema', () => {
  it('parses host-only event', () => {
    const ev = parseFolderEvent({
      hostkey: 'shop.example.com',
      host: 'shop.example.com',
      createdAt: '2026-10-18T10:00:00.000Z',
    });
    assert.equal(ev.hostkey, 'shop.example.com');
    assert.equal(ev.host, 'shop.example.com');
    assert.ok(!('type' in ev) || ev.type === undefined);
    assert.ok(!ev.guid);
  });

  it('rejects missing hostkey/host', () => {
    assert.throws(
      () => parseFolderEvent({ hostkey: '', host: 'x' }),
      /folder_event_host_required/,
    );
  });

  it('MessageGroupId is hostkey', () => {
    const ev = buildFolderEvent({
      hostkey: 'a.example.com',
      host: 'a.example.com',
    });
    assert.equal(messageGroupId(ev), 'a.example.com');
  });

  it('dedup id includes reason', () => {
    const id = messageDeduplicationId({
      hostkey: 'a.example.com',
      createdAt: 't1',
      reason: 'guid:abc',
    });
    assert.match(id, /guid:abc/);
  });
});

describe('FR #3987 resolvePageUri', () => {
  it('prefers Referer path', () => {
    assert.equal(
      resolvePageUri({ referer: 'https://shop.example.com/products/brakes?x=1' }),
      '/products/brakes',
    );
  });

  it('falls back to pageUri param', () => {
    assert.equal(resolvePageUri({ pageUri: '/parts' }), '/parts');
  });
});

describe('FR #3987 annotationNeed', () => {
  it('create when not annotated', () => {
    assert.equal(annotationNeed({ annotated: '0' }), 'create');
    assert.equal(annotationNeed({}), 'create');
  });

  it('update when lastmod > lastupdate', () => {
    assert.equal(
      annotationNeed({
        annotated: '1',
        lastmod: '2026-10-18T13:00:00.000Z',
        lastupdate: '2026-10-18T12:00:00.000Z',
      }),
      'update',
    );
  });

  it('skip when lastmod <= lastupdate', () => {
    assert.equal(
      annotationNeed({
        annotated: '1',
        lastmod: '2026-10-18T12:00:00.000Z',
        lastupdate: '2026-10-18T12:00:00.000Z',
      }),
      'skip',
    );
  });
});

describe('FR #3987 gateway publish host on create', () => {
  it('publishes host event when new host is created', async () => {
    const s3 = createMemoryS3();
    const sent = [];
    const userid = mintChecksummedUserId({
      randomBytes: () => Buffer.from([1, 2, 3, 4, 5, 6, 7]),
    });
    await ensureAclubsHost({
      host: 'pub-host.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: () => userid,
      sendMessage: async (m) => {
        sent.push(m);
      },
      folderEventsQueueUrl: 'https://sqs.example/q.fifo',
    });
    assert.equal(sent.length, 1);
    const body = JSON.parse(sent[0].MessageBody);
    assert.equal(body.hostkey, 'pub-host.example.com');
    assert.equal(body.host, 'pub-host.example.com');
    assert.ok(body.createdAt);
    assert.equal(sent[0].MessageGroupId, 'pub-host.example.com');
    assert.ok(!body.type);
    assert.ok(!body.guid);
  });

  it('publishes host event again when new GUID is created', async () => {
    const s3 = createMemoryS3();
    const sent = [];
    const sendMessage = async (m) => {
      sent.push(m);
    };
    const queueUrl = 'https://sqs.example/q.fifo';
    const userid = mintChecksummedUserId({
      randomBytes: () => Buffer.from([8, 9, 10, 11, 12, 13, 14]),
    });
    await ensureAclubsHost({
      host: 'pub-guid.example.com',
      headObject: s3.headObject,
      putObject: s3.putObject,
      putObjectTagging: s3.putObjectTagging,
      mint: () => userid,
      sendMessage,
      folderEventsQueueUrl: queueUrl,
    });
    sent.length = 0;
    const r = await ensureAclubsWidget({
      host: 'pub-guid.example.com',
      widgetGuid: GUID,
      customerNumber: userid,
      referer: 'https://pub-guid.example.com/products/brakes',
      headObject: s3.headObject,
      putObject: s3.putObject,
      sendMessage,
      folderEventsQueueUrl: queueUrl,
    });
    assert.equal(r.created, true);
    assert.equal(r.uri, '/products/brakes');
    assert.equal(r.metadata.seen, '0');
    assert.equal(r.metadata.clicks, '0');
    assert.ok(r.metadata.since);
    assert.ok(r.metadata.lastmod);
    assert.equal(sent.length, 1);
    const body = JSON.parse(sent[0].MessageBody);
    assert.equal(body.hostkey, 'pub-guid.example.com');
    assert.ok(!body.guid);
  });

  it('skips publish when queue unset', async () => {
    const r = await publishFolderEvent({
      hostkey: 'x.example.com',
      host: 'x.example.com',
    });
    assert.equal(r.published, false);
    assert.equal(r.skipped, 'no_queue');
  });
});

describe('FR #3987 redqueen host then GUID', () => {
  async function seedHostAndGuid(s3, host, guid, extraWidgetMd = {}) {
    const createdAt = '2026-10-18T11:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        userid: '0123456C',
        host,
        hostkey: host,
        customerNumber: '0123456C',
        lastmod: createdAt,
        annotated: '0',
      },
    });
    await s3.putObject({
      Key: widgetFileKey(host, guid, 'widget.json'),
      Body: `${JSON.stringify({ widgetGuid: guid, host })}\n`,
      ContentType: 'application/json',
      Metadata: {
        uri: '/products/brakes',
        seen: '0',
        clicks: '0',
        since: createdAt,
        lastmod: createdAt,
        annotated: '0',
        ...extraWidgetMd,
      },
    });
  }

  it('annotates host without annotated, then GUID', async () => {
    const s3 = createMemoryS3();
    const host = 'ann.example.com';
    await seedHostAndGuid(s3, host, GUID);
    let hostReviews = 0;
    let guidReviews = 0;
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewHost: async () => {
        hostReviews += 1;
        return {
          summary: 'Parts shop',
          categories: ['brakes'],
          notes: 'ok',
          model: 'test-host',
        };
      },
      reviewGuid: async (input) => {
        guidReviews += 1;
        assert.equal(input.hostAnnotations.summary, 'Parts shop');
        assert.equal(input.uri, '/products/brakes');
        return {
          summary: 'Brakes page',
          intent: 'shop',
          suggestedQueries: ['brake pads'],
          model: 'test-guid',
        };
      },
    });
    assert.equal(result.action, 'host_processed');
    assert.equal(result.host, 'annotated');
    assert.equal(hostReviews, 1);
    assert.equal(guidReviews, 1);
    assert.equal(result.guids[0].action, 'guid_annotated');

    const hostAnn = JSON.parse(
      (await s3.getObject({ Key: hostAnnotationsKey(host) })).Body.toString('utf8'),
    );
    assert.equal(hostAnn.model, 'test-host');
    assert.equal(hostAnn.summary, 'Parts shop');

    const hostHead = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(hostHead.Metadata.annotated, '1');
    assert.equal(hostHead.Metadata.lastupdate, '2026-10-18T12:00:00.000Z');
    assert.equal(hostHead.Metadata.lastmod, hostHead.Metadata.lastupdate);

    const guidAnn = JSON.parse(
      (
        await s3.getObject({ Key: guidAnnotationsKey(host, GUID) })
      ).Body.toString('utf8'),
    );
    assert.equal(guidAnn.uri, '/products/brakes');
    assert.equal(guidAnn.summary, 'Brakes page');
    assert.deepEqual(guidAnn.suggestedQueries, ['brake pads']);

    const wHead = await s3.headObject({
      Key: widgetFileKey(host, GUID, 'widget.json'),
    });
    assert.equal(wHead.Metadata.annotated, '1');
    assert.equal(wHead.Metadata.lastupdate, wHead.Metadata.lastmod);
  });

  it('skips host review when annotated and unchanged; still annotates new GUID', async () => {
    const s3 = createMemoryS3();
    const host = 'skip-host.example.com';
    const ts = '2026-10-18T11:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
        host,
        hostkey: host,
      },
    });
    await s3.putObject({
      Key: hostAnnotationsKey(host),
      Body: `${JSON.stringify({ host, summary: 'Existing', model: 'prev' })}\n`,
      ContentType: 'application/json',
    });
    await s3.putObject({
      Key: widgetFileKey(host, GUID, 'widget.json'),
      Body: '{}\n',
      Metadata: {
        uri: '/x',
        seen: '0',
        clicks: '0',
        since: ts,
        lastmod: ts,
        annotated: '0',
      },
    });
    let hostReviews = 0;
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewHost: async () => {
        hostReviews += 1;
        return { summary: 'nope', model: 'x' };
      },
      reviewGuid: async (input) => {
        assert.equal(input.hostAnnotations.summary, 'Existing');
        return { summary: 'page', model: 'g' };
      },
    });
    assert.equal(hostReviews, 0);
    assert.equal(result.host, 'skipped');
    assert.equal(result.guids[0].action, 'guid_annotated');
  });

  it('updates when lastmod > lastupdate (steering change)', async () => {
    const s3 = createMemoryS3();
    const host = 'upd.example.com';
    const older = '2026-10-18T10:00:00.000Z';
    const newer = '2026-10-18T11:30:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        annotated: '1',
        lastmod: older,
        lastupdate: older,
        host,
        hostkey: host,
      },
    });
    await s3.putObject({
      Key: hostAnnotationsKey(host),
      Body: `${JSON.stringify({ host, summary: 'Host', model: 'h' })}\n`,
    });
    await s3.putObject({
      Key: widgetFileKey(host, GUID, 'widget.json'),
      Body: '{}\n',
      Metadata: {
        uri: '/y',
        annotated: '1',
        lastmod: newer,
        lastupdate: older,
      },
    });
    await s3.putObject({
      Key: `${host}/${GUID}/steering.json`,
      Body: `${JSON.stringify({ prefer: 'oem' })}\n`,
    });
    await s3.putObject({
      Key: guidAnnotationsKey(host, GUID),
      Body: `${JSON.stringify({ uri: '/y', steering: null })}\n`,
    });
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewGuid: async (input) => {
        assert.deepEqual(input.steering, { prefer: 'oem' });
        return { summary: 're-done', model: 'g2' };
      },
    });
    assert.equal(result.guids[0].action, 'guid_updated');
    const ann = JSON.parse(
      (
        await s3.getObject({ Key: guidAnnotationsKey(host, GUID) })
      ).Body.toString('utf8'),
    );
    assert.deepEqual(ann.steering, { prefer: 'oem' });
    assert.equal(ann.summary, 're-done');
  });

  it('skips unchanged GUID (agent write does not loop)', async () => {
    const s3 = createMemoryS3();
    const host = 'noop.example.com';
    const ts = '2026-10-18T12:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
        host,
        hostkey: host,
      },
    });
    await s3.putObject({
      Key: hostAnnotationsKey(host),
      Body: `${JSON.stringify({ host, summary: 'H' })}\n`,
    });
    await s3.putObject({
      Key: widgetFileKey(host, GUID, 'widget.json'),
      Body: '{}\n',
      Metadata: {
        uri: '/z',
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
      },
    });
    let guidReviews = 0;
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewGuid: async () => {
        guidReviews += 1;
        return { summary: 'x', model: 'g' };
      },
    });
    assert.equal(guidReviews, 0);
    assert.equal(result.guids[0].action, 'noop');
  });

  it('failed host review leaves GUIDs untouched and retries', async () => {
    const s3 = createMemoryS3();
    const host = 'fail.example.com';
    await seedHostAndGuid(s3, host, GUID);
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewHost: async () => {
        throw new Error('model_down');
      },
    });
    assert.equal(result.action, 'retry');
    assert.match(result.detail, /host_review_failed/);
    assert.equal(
      s3.objects.has(guidAnnotationsKey(host, GUID)),
      false,
    );
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(head.Metadata.annotated, '0');
  });

  it('retries when host annotations missing after skip path', async () => {
    const s3 = createMemoryS3();
    const host = 'missing-ann.example.com';
    const ts = '2026-10-18T11:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
        host,
        hostkey: host,
      },
    });
    // no annotations.json
    await s3.putObject({
      Key: widgetFileKey(host, GUID, 'widget.json'),
      Body: '{}\n',
      Metadata: { uri: '/a', annotated: '0', lastmod: ts },
    });
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
    });
    assert.equal(result.action, 'retry');
    assert.equal(result.detail, 'host_annotations_missing');
  });

  it('annotates multiple GUIDs under one host message', async () => {
    const s3 = createMemoryS3();
    const host = 'multi.example.com';
    await seedHostAndGuid(s3, host, GUID);
    await s3.putObject({
      Key: widgetFileKey(host, GUID2, 'widget.json'),
      Body: '{}\n',
      Metadata: {
        uri: '/other',
        seen: '0',
        clicks: '0',
        since: '2026-10-18T11:00:00.000Z',
        lastmod: '2026-10-18T11:00:00.000Z',
        annotated: '0',
      },
    });
    const result = await processFolderEvent({
      event: { hostkey: host, host, createdAt: 't' },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
      reviewHost: async () => ({ summary: 'H', model: 'h' }),
      reviewGuid: async () => ({ summary: 'G', model: 'g' }),
    });
    assert.equal(result.guids.length, 2);
    assert.ok(result.guids.every((g) => g.action === 'guid_annotated'));
  });
});

describe('FR #3987 drainOnce', () => {
  it('deletes on success and visibility-retries on retry', async () => {
    const s3 = createMemoryS3();
    const host = 'drain.example.com';
    const ts = '2026-10-18T11:00:00.000Z';
    await s3.putObject({
      Key: hostMarkerKey(host),
      Body: Buffer.alloc(0),
      Metadata: {
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
        host,
        hostkey: host,
      },
    });
    await s3.putObject({
      Key: hostAnnotationsKey(host),
      Body: `${JSON.stringify({ host, summary: 'ok' })}\n`,
    });

    const deleted = [];
    const visibility = [];
    const queue = [
      {
        MessageId: '1',
        ReceiptHandle: 'r1',
        Body: JSON.stringify({
          hostkey: host,
          host,
          createdAt: 't',
        }),
      },
      {
        MessageId: '2',
        ReceiptHandle: 'r2',
        Body: JSON.stringify({
          hostkey: 'missing.example.com',
          host: 'missing.example.com',
          createdAt: 't',
        }),
      },
    ];
    const out = await drainOnce({
      queueUrl: 'q',
      receiveMessage: async () => ({ Messages: queue }),
      deleteMessage: async (m) => {
        deleted.push(m.ReceiptHandle);
      },
      changeMessageVisibility: async (m) => {
        visibility.push(m.ReceiptHandle);
      },
      headObject: s3.headObject,
      getObject: s3.getObject,
      putObject: s3.putObject,
      listObjectsV2: s3.listObjectsV2,
      now: FIXED_NOW,
    });
    assert.equal(out.processed, 2);
    assert.deepEqual(deleted, ['r1']);
    assert.deepEqual(visibility, ['r2']);
  });
});

describe('FR #3987 CDK pins', () => {
  it('stack source wires FIFO + redqueen user + send grant', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'parts-gateway-stack.js'),
      'utf8',
    );
    assert.match(src, /a-clubs-new-folders\.fifo/);
    assert.match(src, /a-clubs-new-folders-dlq\.fifo/);
    assert.match(src, /QueueEncryption\.SQS_MANAGED/);
    assert.match(src, /fifo:\s*true/);
    assert.match(src, /FOLDER_EVENTS_VISIBILITY_SEC = 90/);
    assert.match(src, /grantSendMessages/);
    assert.match(src, /grantConsumeMessages/);
    assert.match(src, /a-search-redqueen-annotator/);
    assert.match(src, /A_CLUBS_FOLDER_EVENTS_QUEUE_URL/);
  });

  it('docs cover event schema and install', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(doc, /a-clubs-new-folders\.fifo/);
    assert.match(doc, /MessageGroupId/);
    assert.match(doc, /lastupdate/);
    assert.match(doc, /annotated=1/);
    assert.match(doc, /node redqueen\/src\/run\.js/);
    assert.match(doc, /No inbound ports/);
  });

  it('shared package.json files[] includes aClubs/', () => {
    const pkg = require('../shared/package.json');
    assert.ok(pkg.files.includes('aClubs/'));
  });
});
