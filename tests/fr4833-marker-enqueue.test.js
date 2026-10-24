'use strict';

/**
 * FR #4833: host/GUID marker keys only; enqueue Lambda drops deep folder keys.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isHostOrGuidMarkerKey,
  kindFromKey,
  parseChangeEvent,
} = require('../shared/aClubs/changeEvents');
const { enqueueAClubsChange } = require('../parts-gateway/src/enqueueAClubsChange');

const GUID = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
const HOST = 'mmfc.example';
const root = path.join(__dirname, '..');

describe('FR #4833 host/GUID marker keys', () => {
  it('accepts host and GUID markers only', () => {
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/`), true);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/${GUID}/`), true);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/${GUID}/subdir/`), false);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/${GUID}/IN/`), false);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/${GUID}/widget.json`), false);
    assert.equal(isHostOrGuidMarkerKey('a/b/c/'), false);
  });

  it('kindFromKey marks deep trailing-slash keys as other', () => {
    assert.equal(kindFromKey(`${HOST}/`), 'marker');
    assert.equal(kindFromKey(`${HOST}/${GUID}/`), 'marker');
    assert.equal(kindFromKey(`${HOST}/${GUID}/extra/`), 'other');
    assert.equal(parseChangeEvent({ key: `${HOST}/${GUID}/extra/` }).kind, 'other');
  });
});

describe('FR #4833 enqueue Lambda', () => {
  it('enqueues host/GUID markers and skips deep folder keys', async () => {
    const sent = [];
    const sendMessage = async (input) => {
      sent.push(input);
      return {};
    };
    const deps = {
      queueUrl: 'https://sqs.example/a-clubs-changes',
      sendMessage,
    };

    const host = await enqueueAClubsChange(
      {
        source: 'aws.s3',
        detail: { object: { key: `${HOST}/`, etag: '"h1"' } },
      },
      deps,
    );
    assert.equal(host.enqueued, true);
    assert.equal(sent.length, 1);
    const body = JSON.parse(sent[0].MessageBody);
    assert.equal(body.kind, 'marker');
    assert.equal(body.hostkey, HOST);

    const deep = await enqueueAClubsChange(
      { detail: { object: { key: `${HOST}/${GUID}/subdir/` } } },
      deps,
    );
    assert.equal(deep.enqueued, false);
    assert.equal(deep.skipped, 'not_host_guid_marker');
    assert.equal(sent.length, 1);

    const excluded = await enqueueAClubsChange(
      { detail: { object: { key: `${HOST}/${GUID}/IN/` } } },
      deps,
    );
    assert.equal(excluded.enqueued, false);
    assert.equal(excluded.skipped, 'excluded');
    assert.equal(sent.length, 1);
  });
});

describe('FR #4833 CDK pins', () => {
  it('routes suffix / through marker enqueue Lambda, not direct SqsQueue', () => {
    const src = fs.readFileSync(
      path.join(root, 'cdk/lib/parts-gateway-stack.js'),
      'utf8',
    );
    assert.match(src, /a-search-aclubs-marker-enqueue/);
    assert.match(src, /enqueueAClubsChange\.handler/);
    assert.match(src, /AClubsMarkerEnqueueFunction/);
    assert.match(src, /a-clubs-changes-markers/);
    assert.match(src, /LambdaFunction\(markerEnqueueFn\)/);
    // widget/searches stay direct SQS; markers must not share that loop.
    assert.match(src, /changeFileSuffixes/);
    assert.doesNotMatch(
      src,
      /changeSuffixes[\s\S]*suffix:\s*['"]\/['"][\s\S]*SqsQueue\(changesQueue\)/,
    );
    const markerBlock = src.slice(src.indexOf('AClubsChangesMarkers'));
    assert.match(markerBlock, /LambdaFunction/);
    assert.doesNotMatch(
      markerBlock.slice(0, 400),
      /SqsQueue\(changesQueue\)/,
    );
  });
});
