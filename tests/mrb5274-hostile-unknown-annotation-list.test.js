'use strict';

/**
 * docs/mrb-5274: FR #5269 unknown annotation list must refuse PutObject
 * (fail-closed), matching rewriteMarkerMetadata listMarkerObjectAnnotations.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryS3 } = require('../parts-gateway/src/memoryS3');
const { rewriteMarkerMetadata } = require('../shared/widgets/hostFolderMeta');

const KEY = 'www.example.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/';

function denyCopy() {
  const err = new Error('Access is denied');
  err.name = 'AccessDenied';
  err.$metadata = { httpStatusCode: 403 };
  return err;
}

describe('docs/mrb-5274 unknown annotation list refuses Put', () => {
  it('AccessDenied + no listObjectAnnotations never PutObject', async () => {
    const s3 = createMemoryS3();
    await s3.putObject({
      Key: KEY,
      Body: Buffer.alloc(0),
      Metadata: { hasresults: '0' },
    });
    let puts = 0;
    const logs = [];
    await assert.rejects(
      () =>
        rewriteMarkerMetadata({
          Key: KEY,
          bucket: 'a-clubs',
          metadata: { hasresults: '1', lastmod: 't' },
          copyObject: async () => {
            throw denyCopy();
          },
          putObject: async () => {
            puts += 1;
            return {};
          },
          logError: (...a) => logs.push(a.join(' ')),
        }),
      (err) => err && err.code === 'annotated_marker_copy_denied',
    );
    assert.equal(puts, 0);
    assert.ok(logs.some((l) => /annotated_marker_copy_denied/.test(l)));
  });

  it('AccessDenied + list failure (known false) never PutObject', async () => {
    let puts = 0;
    await assert.rejects(
      () =>
        rewriteMarkerMetadata({
          Key: KEY,
          bucket: 'a-clubs',
          metadata: { hasresults: '1' },
          copyObject: async () => {
            throw denyCopy();
          },
          putObject: async () => {
            puts += 1;
            return {};
          },
          listObjectAnnotations: async () => {
            throw new Error('list boom');
          },
          logError: () => {},
        }),
      (err) => err && err.code === 'annotated_marker_copy_denied',
    );
    assert.equal(puts, 0);
  });
});