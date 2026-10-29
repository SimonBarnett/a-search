'use strict';

/**
 * docs/mrb-5276: FR #5255 still allows PutObject when CopyObject is
 * AccessDenied and listObjectAnnotations is known-empty (no annotations).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { rewriteMarkerMetadata } = require('../shared/widgets/hostFolderMeta');

const KEY = 'www.example.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/';

function denyCopy() {
  const err = new Error('Access is denied');
  err.name = 'AccessDenied';
  err.$metadata = { httpStatusCode: 403 };
  return err;
}

describe('docs/mrb-5276 known-empty annotation list may Put after 403', () => {
  it('AccessDenied + Annotations [] uses PutObject', async () => {
    let puts = 0;
    const out = await rewriteMarkerMetadata({
      Key: KEY,
      bucket: 'a-clubs',
      metadata: { hasresults: '1' },
      copyObject: async () => {
        throw denyCopy();
      },
      putObject: async () => {
        puts += 1;
        return { ETag: '"etag-put"' };
      },
      listObjectAnnotations: async () => ({ Annotations: [] }),
    });
    assert.equal(puts, 1);
    assert.equal(out.via, 'put');
  });
});
