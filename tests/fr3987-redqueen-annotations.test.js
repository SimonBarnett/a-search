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
const { annotationNeed } = require('../redqueen/src/annotate');
const { hostMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const {
  mintChecksummedUserId,
} = require('../shared/identity/madeiraUserId');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

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
      userid,
      referer: 'https://pub-guid.example.com/products/brakes',
      headObject: s3.headObject,
      putObject: s3.putObject,
      getObject: s3.getObject,
      copyObject: s3.copyObject,
      getObjectTagging: s3.getObjectTagging,
      putObjectTagging: s3.putObjectTagging,
      sendMessage,
      folderEventsQueueUrl: queueUrl,
    });
    assert.equal(r.created, true);
    assert.equal(r.uri, '/products/brakes');
    assert.equal(r.metadata.seen, '0');
    assert.equal(r.metadata.clicks, '0');
    assert.equal(r.metadata.enabled, '0');
    assert.equal(Object.prototype.hasOwnProperty.call(r.metadata, 'init'), false);
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


// FR #4098 superseded redqueen annotation I/O (object annotations + GUID folder markers).
// Integration coverage lives in tests/fr4098-redqueen-queue-service.test.js.
describe('FR #3987 redqueen host then GUID (pointer)', () => {
  it('defers to FR #4098 object-annotation suite', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    assert.ok(
      fs.existsSync(
        path.join(__dirname, 'fr4098-redqueen-queue-service.test.js'),
      ),
    );
  });
});

