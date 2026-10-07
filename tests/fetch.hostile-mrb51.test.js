'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { fetchFeed, contentHash } = require('../maintainer/src/fetch');

describe('MRB #51 hostile: FR-013 conditional fetch', () => {
  it('Mock 304 → no upsert', async () => {
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
      bumpLastChecked: async () => ({}),
    });
    assert.equal(result.shouldUpsert, false);
    assert.equal(upserted, false);
  });

  it('Hash match → no upsert; bump LastChecked', async () => {
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
        ContentHash: hash,
      },
      httpGet: async () => ({ status: 200, headers: {}, body }),
      upsert: async () => {
        upserted = true;
      },
      bumpLastChecked: async () => {
        bumped = true;
      },
    });
    assert.equal(result.shouldUpsert, false);
    assert.equal(upserted, false);
    assert.equal(bumped, true);
  });
});
