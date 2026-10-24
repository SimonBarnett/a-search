'use strict';

/**
 * FR #4827: searches.json content hash and repost when it differs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  searchesContentHash,
  shouldPostSearch,
} = require('../shared/aClubs/searchesHash');
const { publishGuidSearch } = require('../redqueen/src/guidSearch');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function doc(extra) {
  return {
    queries: [{ q: 'brake pads', intent: 'page', maxResults: 10 }],
    exclude: [{ match: 'used', reason: 'steering' }],
    ...extra,
  };
}

describe('FR #4827 searches hash', () => {
  it('is stable for key order and ignores searchid', () => {
    const a = searchesContentHash({
      queries: [{ maxResults: 10, q: 'brake pads', intent: 'page' }],
      exclude: [{ reason: 'steering', match: 'used' }],
    });
    const b = searchesContentHash(doc());
    assert.equal(a, b);
    assert.equal(a, searchesContentHash({ ...doc(), searchid: 'srch_x', market: 'GB' }));
    assert.notEqual(a, searchesContentHash({ queries: [{ q: 'oil' }], exclude: [] }));
    assert.equal(a.length, 64);
  });

  it('posts when there is no searchid or the stored hash differs', () => {
    const body = doc();
    const hash = searchesContentHash(body);
    assert.equal(shouldPostSearch({ doc: body, markerMeta: {} }), true);
    assert.equal(
      shouldPostSearch({ doc: { ...body, searchid: 'srch_1' }, markerMeta: {} }),
      false,
    );
    assert.equal(
      shouldPostSearch({
        doc: { ...body, searchid: 'srch_1' },
        markerMeta: { searcheshash: hash },
      }),
      false,
    );
    assert.equal(
      shouldPostSearch({
        doc: { ...body, searchid: 'srch_1' },
        markerMeta: { searcheshash: 'f'.repeat(64) },
      }),
      true,
    );
  });

  it('hash mismatch reposts even when searchid is set; a match does not', async () => {
    const body = doc({ searchid: 'srch_old' });
    const hash = searchesContentHash(body);
    const posts = [];
    const base = {
      hostkey: 'mmfc.example',
      guid: GUID,
      repostExisting: true,
      getObject: async () => ({ Body: Buffer.from(JSON.stringify(body)) }),
      putObject: async () => ({ ETag: '"put"' }),
      headObject: async () => ({ Metadata: { annotated: '1', searcheshash: hash } }),
      copyObject: async () => ({ CopyObjectResult: { ETag: '"copy"' } }),
      postSearch: async (payload) => {
        posts.push(payload);
        return { ok: true, status: 202, searchid: 'srch_new' };
      },
    };
    const same = await publishGuidSearch({
      ...base,
      metadata: { searcheshash: hash },
    });
    assert.equal(same.idempotent, true);
    assert.equal(same.wrote, false);
    assert.equal(posts.length, 0);

    const changed = await publishGuidSearch({
      ...base,
      metadata: { searcheshash: 'a'.repeat(64) },
    });
    assert.equal(changed.wrote, true);
    assert.equal(changed.reposted, true);
    assert.equal(changed.searchid, 'srch_new');
    assert.equal(changed.searcheshash, hash);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].guid, GUID);
  });
});
