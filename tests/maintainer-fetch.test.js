'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { fetchFeed, contentHash } = require('../maintainer/src/fetch');

describe('FR-013 conditional feed download', () => {
  it('Mock 304 → skip upsert (unchanged)', async () => {
    let upserted = false;
    const result = await fetchFeed({
      feed: {
        Source: 'awin',
        FeedKey: 'adv1',
        Env: 'live',
        FeedUrl: 'https://feeds.example.invalid/a.csv',
        ETag: '"abc"',
        LastModified: 'Wed, 01 Oct 2025 00:00:00 GMT',
        ContentHash: 'deadbeef',
      },
      httpGet: async ({ headers }) => {
        assert.equal(headers['If-None-Match'], '"abc"');
        assert.equal(headers['If-Modified-Since'], 'Wed, 01 Oct 2025 00:00:00 GMT');
        return { status: 304, headers: {}, body: Buffer.alloc(0) };
      },
      upsert: async () => {
        upserted = true;
      },
      bumpLastChecked: async () => ({ bumped: true }),
    });
    assert.equal(result.action, 'skip_304');
    assert.equal(result.shouldUpsert, false);
    assert.equal(upserted, false);
  });

  it('Hash match after download → no upsert; bump LastChecked', async () => {
    const body = Buffer.from('sku,title\n1,Widget\n');
    const hash = contentHash(body);
    let upserted = false;
    let bumped = false;
    const result = await fetchFeed({
      feed: {
        Source: 'awin',
        FeedKey: 'adv1',
        Env: 'sandbox',
        FeedUrl: 'https://feeds.example.invalid/a.csv',
        ETag: null,
        LastModified: null,
        ContentHash: hash,
      },
      httpGet: async () => ({
        status: 200,
        headers: { etag: '"new"' },
        body,
      }),
      upsert: async () => {
        upserted = true;
      },
      bumpLastChecked: async () => {
        bumped = true;
      },
    });
    assert.equal(result.action, 'skip_hash_match');
    assert.equal(result.shouldUpsert, false);
    assert.equal(upserted, false);
    assert.equal(bumped, true);
    assert.equal(result.contentHash, hash);
  });

  it('Changed body → shouldUpsert with new hash', async () => {
    const body = Buffer.from('sku,title\n2,Other\n');
    let upsertPayload = null;
    const result = await fetchFeed({
      feed: {
        Source: 'awin',
        FeedKey: 'adv1',
        Env: 'live',
        FeedUrl: 'https://feeds.example.invalid/a.csv',
        ContentHash: 'oldhash',
      },
      httpGet: async () => ({
        status: 200,
        headers: {
          etag: '"etag2"',
          'last-modified': 'Thu, 02 Oct 2025 00:00:00 GMT',
        },
        body,
      }),
      upsert: async (payload) => {
        upsertPayload = payload;
      },
      bumpLastChecked: async () => {},
    });
    assert.equal(result.action, 'download');
    assert.equal(result.shouldUpsert, true);
    assert.ok(upsertPayload);
    assert.equal(upsertPayload.contentHash, contentHash(body));
    assert.equal(upsertPayload.etag, '"etag2"');
  });
});
