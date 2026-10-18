'use strict';

/**
 * FR #4098: redqueen a-clubs queue service --- object annotations, GUID markers,
 * stub never annotates, install script, hook.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { hostMarkerKey, guidMarkerKey } = require('../parts-gateway/src/aClubsKeys');
const {
  processFolderEvent,
  annotationNeed,
  hostAnnotationsKey,
  guidAnnotationsKey,
  listGuidIds,
  isUsableReview,
} = require('../redqueen/src/annotate');
const { drainOnce } = require('../redqueen/src/drain');
const { isUsableReview: isUsableFromReviewers } = require('../redqueen/src/reviewers');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GUID2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const FIXED_NOW = () => new Date('2026-10-18T12:00:00.000Z');
const ROOT = path.join(__dirname, '..');

async function seedHostAndGuid(s3, host, guid, extraMd = {}) {
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
  await s3.putObject({
    Key: guidMarkerKey(host, guid),
    Body: Buffer.alloc(0),
    Metadata: {
      uri: '/products/brakes',
      seen: '0',
      clicks: '0',
      since: createdAt,
      lastmod: createdAt,
      annotated: '0',
      ...extraMd,
    },
  });
}

function s3Deps(s3, extra = {}) {
  return {
    headObject: s3.headObject,
    getObject: s3.getObject,
    putObject: s3.putObject,
    listObjectsV2: s3.listObjectsV2,
    copyObject: s3.copyObject,
    putObjectAnnotation: s3.putObjectAnnotation,
    getObjectAnnotation: s3.getObjectAnnotation,
    listObjectAnnotations: s3.listObjectAnnotations,
    bucket: 'a-clubs',
    now: FIXED_NOW,
    ...extra,
  };
}

describe('FR #4098 object annotations (no sidecars)', () => {
  it('annotates host then GUID via PutObjectAnnotation; no annotations.json', async () => {
    const s3 = createMemoryS3();
    const host = 'ann.example.com';
    await seedHostAndGuid(s3, host, GUID);
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        reviewHost: async () => ({
          summary: 'Parts shop',
          categories: ['brakes'],
          model: 'test-host',
        }),
        reviewGuid: async (input) => {
          assert.equal(input.hostAnnotations.summary, 'Parts shop');
          assert.equal(input.uri, '/products/brakes');
          return {
            summary: 'Brakes page',
            intent: 'shop',
            suggestedQueries: ['brake pads'],
            steering: { prefer: 'oem' },
            model: 'test-guid',
          };
        },
      }),
    );
    assert.equal(result.action, 'host_processed');
    assert.equal(result.host, 'annotated');
    assert.equal(result.guids[0].action, 'guid_annotated');

    assert.equal(s3.objects.has(hostAnnotationsKey(host)), false);
    assert.equal(s3.objects.has(guidAnnotationsKey(host, GUID)), false);
    assert.equal(s3.objects.has(`${host}/${GUID}/steering.json`), false);

    const hostAnn = await s3.getObjectAnnotation({
      Key: hostMarkerKey(host),
      AnnotationName: 'annotation',
    });
    const hostDoc = JSON.parse(hostAnn.AnnotationPayload.toString('utf8'));
    assert.equal(hostDoc.model, 'test-host');
    assert.equal(hostDoc.summary, 'Parts shop');

    const guidAnn = await s3.getObjectAnnotation({
      Key: guidMarkerKey(host, GUID),
      AnnotationName: 'annotation',
    });
    const guidDoc = JSON.parse(guidAnn.AnnotationPayload.toString('utf8'));
    assert.equal(guidDoc.uri, '/products/brakes');
    assert.deepEqual(guidDoc.suggestedQueries, ['brake pads']);

    const steer = await s3.getObjectAnnotation({
      Key: guidMarkerKey(host, GUID),
      AnnotationName: 'steering',
    });
    assert.deepEqual(JSON.parse(steer.AnnotationPayload.toString('utf8')), {
      prefer: 'oem',
    });

    const hostHead = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(hostHead.Metadata.annotated, '1');
    assert.equal(hostHead.Metadata.lastupdate, hostHead.Metadata.lastmod);

    const guidHead = await s3.headObject({ Key: guidMarkerKey(host, GUID) });
    assert.equal(guidHead.Metadata.annotated, '1');
  });

  it('lists GUIDs from folder markers not widget.json', async () => {
    const s3 = createMemoryS3();
    const host = 'list.example.com';
    await seedHostAndGuid(s3, host, GUID);
    await s3.putObject({
      Key: guidMarkerKey(host, GUID2),
      Body: Buffer.alloc(0),
      Metadata: { uri: '/other', annotated: '0', lastmod: '2026-10-18T11:00:00.000Z' },
    });
    // decoy widget.json must not count
    await s3.putObject({
      Key: `${host}/${GUID}/widget.json`,
      Body: '{}\n',
    });
    const ids = await listGuidIds(
      { listObjectsV2: s3.listObjectsV2 },
      host,
    );
    assert.deepEqual(ids, [GUID, GUID2].map((g) => g.toLowerCase()).sort());
  });

  it('stub / unavailable reviewer never sets annotated=1', async () => {
    const s3 = createMemoryS3();
    const host = 'stub.example.com';
    await seedHostAndGuid(s3, host, GUID);
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        reviewHost: async () => ({ model: 'stub', summary: 'nope', usable: false }),
      }),
    );
    assert.equal(result.action, 'retry');
    assert.match(result.detail, /host_reviewer_unavailable/);
    const head = await s3.headObject({ Key: hostMarkerKey(host) });
    assert.equal(head.Metadata.annotated, '0');
    assert.equal(s3.objects.has(hostAnnotationsKey(host)), false);
  });

  it('skips when annotated=1 and not stale', async () => {
    const s3 = createMemoryS3();
    const host = 'skip.example.com';
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
    await s3.putObjectAnnotation({
      Key: hostMarkerKey(host),
      AnnotationName: 'annotation',
      AnnotationPayload: JSON.stringify({ host, summary: 'H', model: 'prev' }),
    });
    await s3.putObject({
      Key: guidMarkerKey(host, GUID),
      Body: Buffer.alloc(0),
      Metadata: {
        uri: '/z',
        annotated: '1',
        lastmod: ts,
        lastupdate: ts,
      },
    });
    let hostReviews = 0;
    let guidReviews = 0;
    const result = await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        reviewHost: async () => {
          hostReviews += 1;
          return { summary: 'x', model: 'h' };
        },
        reviewGuid: async () => {
          guidReviews += 1;
          return { summary: 'y', model: 'g' };
        },
      }),
    );
    assert.equal(hostReviews, 0);
    assert.equal(guidReviews, 0);
    assert.equal(result.host, 'skipped');
    assert.equal(result.guids[0].action, 'noop');
  });

  it('re-applies annotations if metadata rewrite drops them', async () => {
    const s3 = createMemoryS3();
    const host = 'survive.example.com';
    await seedHostAndGuid(s3, host, GUID);
    // Hostile copyObject that clears annotations
    const clearCopy = async (input) => {
      await s3.copyObject(input);
      const o = s3.objects.get(input.Key);
      if (o) o.Annotations = new Map();
    };
    await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        copyObject: clearCopy,
        reviewHost: async () => ({ summary: 'H', model: 'h' }),
        reviewGuid: async () => ({ summary: 'G', model: 'g' }),
      }),
    );
    const listed = await s3.listObjectAnnotations({ Key: hostMarkerKey(host) });
    assert.ok(
      (listed.Annotations || []).some((a) => a.AnnotationName === 'annotation'),
    );
  });

  it('onNewFolder hook fires for host and guid', async () => {
    const s3 = createMemoryS3();
    const host = 'hook.example.com';
    await seedHostAndGuid(s3, host, GUID);
    const events = [];
    await processFolderEvent(
      s3Deps(s3, {
        event: { hostkey: host, host, createdAt: 't' },
        reviewHost: async () => ({ summary: 'H', model: 'h' }),
        reviewGuid: async () => ({ summary: 'G', model: 'g' }),
        onNewFolder: async (e) => {
          events.push(e.kind);
        },
      }),
    );
    assert.deepEqual(events, ['host', 'guid']);
  });

  it('isUsableReview rejects stub', () => {
    assert.equal(isUsableReview({ model: 'stub' }), false);
    assert.equal(isUsableFromReviewers({ model: 'stub' }), false);
    assert.equal(isUsableReview({ model: 'grok', summary: 'ok' }), true);
  });
});

describe('FR #4098 drain + install pins', () => {
  it('drainOnce retries when reviewer unavailable (does not delete)', async () => {
    const s3 = createMemoryS3();
    const host = 'drain.example.com';
    await seedHostAndGuid(s3, host, GUID);
    let deleted = 0;
    const result = await drainOnce({
      queueUrl: 'https://example/queue',
      receiveMessage: async () => ({
        Messages: [
          {
            MessageId: '1',
            ReceiptHandle: 'rh',
            Body: JSON.stringify({ hostkey: host, host, createdAt: 't' }),
          },
        ],
      }),
      deleteMessage: async () => {
        deleted += 1;
      },
      changeMessageVisibility: async () => {},
      ...s3Deps(s3, {
        reviewHost: async () => ({ model: 'stub', usable: false }),
      }),
    });
    assert.equal(result.actions[0].action, 'retry');
    assert.equal(deleted, 0);
  });

  it('install script exists and is WinPS 5.1 idempotent sc.exe service', () => {
    const script = path.join(
      ROOT,
      'redqueen',
      'install',
      'Register-AClubsQueueService.ps1',
    );
    assert.ok(fs.existsSync(script));
    const src = fs.readFileSync(script, 'utf8');
    assert.match(src, /#Requires -Version 5\.1/);
    assert.match(src, /sc\.exe create/);
    assert.match(src, /sc\.exe config/);
    assert.match(src, /a-search-redqueen-annotator/);
    assert.match(src, /failure/);
    assert.match(src, /Unregister/);
    assert.doesNotMatch(src, /annotations\.json/);
  });

  it('docs/redqueen-annotations.md describes object annotations + service', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'docs', 'redqueen-annotations.md'),
      'utf8',
    );
    assert.match(doc, /PutObjectAnnotation|object annotation/i);
    assert.doesNotMatch(doc, /writes `annotations\.json`/);
    assert.match(doc, /guidMarkerKey|GUID folder marker|trailing.?slash/i);
    assert.match(doc, /Register-AClubsQueueService|Windows service/i);
    assert.match(doc, /Grok first|stub must never/i);
  });

  it('annotationNeed still create/update/skip', () => {
    assert.equal(annotationNeed({}), 'create');
    assert.equal(
      annotationNeed({
        annotated: '1',
        lastmod: '2026-10-18T13:00:00.000Z',
        lastupdate: '2026-10-18T12:00:00.000Z',
      }),
      'update',
    );
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
