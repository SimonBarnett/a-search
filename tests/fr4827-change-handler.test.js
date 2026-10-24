'use strict';

/**
 * FR #4827: change handler — searches post, widget/marker folder event, self etag drop.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleChangeEvent } = require('../redqueen/src/changeHandler');
const { searchesContentHash } = require('../shared/aClubs/searchesHash');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'mmfc.example';

describe('FR #4827 change handler', () => {
  it('drops an event whose etag is in selfEtags', async () => {
    const selfEtags = new Map();
    const key = `${HOST}/${GUID}/widget.json`;
    selfEtags.set(key, 'abc');
    let called = 0;
    const result = await handleChangeEvent({
      event: { hostkey: HOST, guid: GUID, kind: 'widget', key, etag: '"ABC"' },
      selfEtags,
      processFolderEvent: async () => {
        called += 1;
        return { action: 'host_processed' };
      },
    });
    assert.equal(result.action, 'dropped');
    assert.equal(result.detail, 'self_etag');
    assert.equal(called, 0);
  });

  it('posts searches.json when the hash differs and returns searcheshash', async () => {
    const queries = [{ q: 'pads', intent: 'page', maxResults: 10 }];
    const exclude = [];
    const hash = searchesContentHash({ queries, exclude });
    const posts = [];
    const result = await handleChangeEvent({
      event: {
        hostkey: HOST,
        guid: GUID,
        kind: 'searches',
        key: `${HOST}/${GUID}/searches.json`,
        etag: 'e1',
      },
      metadata: { searcheshash: 'b'.repeat(64) },
      getObject: async () => ({
        Body: Buffer.from(JSON.stringify({ queries, exclude, searchid: 'srch_old' })),
      }),
      putObject: async () => ({ ETag: '"p"' }),
      headObject: async () => ({ Metadata: { annotated: '1' } }),
      copyObject: async (input) => {
        assert.equal(input.Metadata.searcheshash, hash);
        return { CopyObjectResult: { ETag: '"c"' } };
      },
      postSearch: async (body) => {
        posts.push(body);
        return { ok: true, status: 202, searchid: 'srch_next' };
      },
    });
    assert.equal(result.action, 'search_posted');
    assert.equal(result.searcheshash, hash);
    assert.equal(posts.length, 1);
  });

  it('does not post when the stored hash matches', async () => {
    const queries = [{ q: 'pads' }];
    const exclude = [];
    const hash = searchesContentHash({ queries, exclude });
    let posts = 0;
    const result = await handleChangeEvent({
      event: {
        hostkey: HOST,
        guid: GUID,
        kind: 'searches',
        key: `${HOST}/${GUID}/searches.json`,
      },
      metadata: { searcheshash: hash },
      getObject: async () => ({
        Body: Buffer.from(JSON.stringify({ queries, exclude, searchid: 'srch_keep' })),
      }),
      postSearch: async () => {
        posts += 1;
        return { ok: true, status: 202, searchid: 'nope' };
      },
    });
    assert.equal(result.action, 'skipped');
    assert.equal(result.searcheshash, hash);
    assert.equal(posts, 0);
  });

  it('widget and marker events become a folder event with hostkey and host', async () => {
    const seen = [];
    const common = {
      headObject: async () => ({ Metadata: { host: 'https://mmfc.example' } }),
      copyObject: async () => ({ CopyObjectResult: { ETag: '"bump"' } }),
      now: () => new Date('2026-10-24T12:00:00.000Z'),
      processFolderEvent: async (opts) => {
        seen.push(opts.event);
        return { action: 'host_processed', guids: [] };
      },
    };
    const widget = await handleChangeEvent({
      ...common,
      event: {
        hostkey: HOST,
        guid: GUID,
        kind: 'widget',
        key: `${HOST}/${GUID}/widget.json`,
        etag: 'w',
      },
    });
    assert.equal(widget.action, 'host_processed');
    assert.equal(seen[0].hostkey, HOST);
    assert.equal(seen[0].host, 'https://mmfc.example');
    assert.equal(seen[0].createdAt, '2026-10-24T12:00:00.000Z');

    const marker = await handleChangeEvent({
      ...common,
      event: { hostkey: HOST, kind: 'marker', key: `${HOST}/`, etag: 'm' },
    });
    assert.equal(marker.action, 'host_processed');
    assert.equal(seen[1].hostkey, HOST);
    assert.equal(seen.length, 2);
  });

  it('skips other kinds and excluded events', async () => {
    const other = await handleChangeEvent({
      event: { hostkey: HOST, guid: GUID, kind: 'other', key: `${HOST}/${GUID}/notes.txt` },
    });
    assert.equal(other.action, 'skipped');
    const excluded = await handleChangeEvent({
      body: JSON.stringify({ key: `${HOST}/${GUID}/IN/x.json` }),
    });
    assert.equal(excluded.detail, 'excluded_key');
  });
});
