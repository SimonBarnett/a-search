'use strict';

/**
 * FR #4889: /parts seed searches.json change event must no-op (no POST, delete).
 * A throw on one batch message must not stop the others.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleChangeEvent } = require('../redqueen/src/changeHandler');
const { drainOnce } = require('../redqueen/src/drain');

const GUID = '11111111-1111-4111-8111-111111111111';
const HOST = 'www.example.org';

function searchesEvent() {
  return {
    kind: 'searches',
    hostkey: HOST,
    guid: GUID,
    key: `${HOST}/${GUID}/searches.json`,
    etag: 'abc',
  };
}

describe('FR #4889 empty searches.json seed', () => {
  it('seed searches.json event is skipped and does not postSearch', async () => {
    let posts = 0;
    const result = await handleChangeEvent({
      event: searchesEvent(),
      getObject: async () => ({ Body: '{"queries":[],"exclude":[]}' }),
      headObject: async () => ({ Metadata: {} }),
      postSearch: async () => {
        posts += 1;
        return { ok: true, searchid: 'x' };
      },
    });
    assert.equal(result.action, 'skipped');
    assert.equal(result.detail, 'searches_empty_seed');
    assert.equal(posts, 0);
  });

  it('searches.json with queries still posts when hash changes', async () => {
    const posts = [];
    const result = await handleChangeEvent({
      event: searchesEvent(),
      getObject: async () => ({
        Body: JSON.stringify({
          queries: [{ q: 'pads', intent: 'page', maxResults: 10 }],
          exclude: [],
          searchid: 'srch_old',
        }),
      }),
      headObject: async () => ({ Metadata: { annotated: '1', searcheshash: 'old' } }),
      putObject: async () => ({ ETag: '"p"' }),
      copyObject: async () => ({ CopyObjectResult: { ETag: '"c"' } }),
      postSearch: async (body) => {
        posts.push(body);
        return { ok: true, status: 202, searchid: 'srch_next' };
      },
    });
    assert.equal(result.action, 'search_posted');
    assert.equal(posts.length, 1);
  });

  it('batch: bad throw on first message does not block delete of a good one', async () => {
    const deleted = [];
    const retried = [];
    const out = await drainOnce({
      queueUrl: 'https://sqs.example/changes',
      maxMessages: 2,
      waitTimeSeconds: 0,
      receiveMessage: async () => ({
        Messages: [
          {
            MessageId: 'bad',
            ReceiptHandle: 'r-bad',
            Body: JSON.stringify({
              kind: 'searches',
              hostkey: HOST,
              guid: GUID,
              key: `${HOST}/${GUID}/searches.json`,
            }),
          },
          {
            MessageId: 'good',
            ReceiptHandle: 'r-good',
            Body: JSON.stringify({
              kind: 'other',
              hostkey: HOST,
              guid: GUID,
              key: `${HOST}/${GUID}/notes.txt`,
            }),
          },
        ],
      }),
      deleteMessage: async (input) => {
        deleted.push(input.ReceiptHandle);
      },
      changeMessageVisibility: async (input) => {
        retried.push(input.ReceiptHandle);
      },
      getObject: async () => {
        throw Object.assign(new Error('boom'), { code: 'NoSuchKey' });
      },
      headObject: async () => ({ Metadata: {} }),
      postSearch: async () => ({ ok: true, searchid: 'nope' }),
    });
    assert.equal(out.processed, 2);
    assert.ok(deleted.includes('r-good'), 'good message must be deleted');
    const bad = out.actions.find((a) => a.messageId === 'bad');
    assert.ok(bad);
    assert.equal(bad.action, 'retry');
  });
});
