'use strict';

/**
 * FR-031: schedule.handler wires roll → fetch → upsert → delete.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { handler } = require('../maintainer/src/schedule');

const NOW = new Date('2026-10-07T12:00:00.000Z');

function feedRow(partial) {
  return {
    Source: 'awin',
    FeedKey: 'adv1',
    Env: 'live',
    FeedUrl: 'https://feeds.example.invalid/a.json',
    ETag: null,
    LastModified: null,
    ContentHash: null,
    NextCheck: new Date('2026-10-07T11:00:00.000Z'),
    ...partial,
  };
}

describe('FR-031 maintainer schedule.handler', () => {
  it('fixture PartFeedKeys → processed > 0 (not stub)', async () => {
    const calls = { upsert: 0, del: 0, http: 0 };
    const body = Buffer.from(
      JSON.stringify([
        { MerchantProductId: 'p1', Title: 'Widget', ContentHash: 'h1' },
      ]),
    );
    const res = await handler(
      {},
      {},
      {
        envVars: { A_SEARCH_ENV: 'live', MAINTAINER_TOP: '5' },
        now: NOW,
        queryPartFeedKeys: async () => [feedRow({})],
        httpGet: async () => {
          calls.http += 1;
          return { status: 200, headers: {}, body };
        },
        runMerge: async () => {
          calls.upsert += 1;
          return { ok: true };
        },
        runScopedDelete: async () => {
          calls.del += 1;
          return { deleted: 0 };
        },
      },
    );
    assert.equal(res.ok, true);
    assert.equal(res.env, 'live');
    assert.ok(res.processed > 0);
    assert.doesNotMatch(res.message, /stub/i);
    assert.equal(calls.http, 1);
    assert.equal(calls.upsert, 1);
    assert.equal(calls.del, 1);
    assert.equal(res.upserted, 1);
  });

  it('mock fetch 304 → skip upsert and delete', async () => {
    const calls = { upsert: 0, del: 0, bump: 0 };
    const res = await handler(
      {},
      {},
      {
        envVars: { A_SEARCH_ENV: 'sandbox', MAINTAINER_TOP: '10' },
        now: NOW,
        queryPartFeedKeys: async () => [
          feedRow({
            Env: 'sandbox',
            ETag: '"abc"',
            ContentHash: 'old',
          }),
        ],
        httpGet: async () => ({ status: 304, headers: {}, body: Buffer.alloc(0) }),
        bumpLastChecked: async () => {
          calls.bump += 1;
        },
        runMerge: async () => {
          calls.upsert += 1;
        },
        runScopedDelete: async () => {
          calls.del += 1;
        },
      },
    );
    assert.equal(res.processed, 1);
    assert.equal(res.skipped, 1);
    assert.equal(res.upserted, 0);
    assert.equal(calls.upsert, 0);
    assert.equal(calls.del, 0);
    assert.equal(calls.bump, 1);
    assert.equal(res.results[0].action, 'skip_304');
  });

  it('mock fetch body → upsert + delete called', async () => {
    const mergeArgs = [];
    const deleteArgs = [];
    const body = Buffer.from(
      JSON.stringify([
        { MerchantProductId: 'm2', Title: 'Gadget' },
        { MerchantProductId: 'm3', Title: 'Gizmo' },
      ]),
    );
    const res = await handler(
      {},
      {},
      {
        envVars: { A_SEARCH_ENV: 'live', MAINTAINER_TOP: '3' },
        now: NOW,
        queryPartFeedKeys: async () => [
          feedRow({ FeedKey: 'k2' }),
          feedRow({
            FeedKey: 'future',
            NextCheck: new Date('2026-10-07T13:00:00.000Z'),
          }),
        ],
        httpGet: async () => ({ status: 200, headers: { etag: '"e"' }, body }),
        runMerge: async (args) => {
          mergeArgs.push(args);
          return { ok: true };
        },
        runScopedDelete: async (args) => {
          deleteArgs.push(args);
          return { deleted: 1 };
        },
      },
    );
    assert.equal(res.processed, 1);
    assert.equal(res.upserted, 1);
    assert.equal(mergeArgs.length, 1);
    assert.equal(mergeArgs[0].feedKey, 'k2');
    assert.equal(mergeArgs[0].rowCount, 2);
    assert.equal(deleteArgs.length, 1);
    assert.equal(deleteArgs[0].feedKey, 'k2');
  });
});
