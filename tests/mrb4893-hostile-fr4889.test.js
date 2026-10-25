'use strict';

/**
 * Hostile MRB #4893 / FR #4889: empty seed never POSTs; throw isolaton;
 * handwritten queries still post.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { handleChangeEvent } = require('../redqueen/src/changeHandler');
const { publishGuidSearch } = require('../redqueen/src/guidSearch');
const { drainOnce } = require('../redqueen/src/drain');

const GUID = '22222222-2222-4222-8222-222222222222';
const HOST = 'club.example.test';

describe('MRB #4893 hostile FR #4889', () => {
  it('publishGuidSearch empty queries returns searches_empty_seed and never posts', async () => {
    let posts = 0;
    const out = await publishGuidSearch({
      hostkey: HOST,
      guid: GUID,
      repostExisting: true,
      getObject: async () => ({ Body: '{"exclude":[]}' }),
      headObject: async () => ({ Metadata: {} }),
      postSearch: async () => {
        posts += 1;
        return { ok: true, searchid: 'must_not' };
      },
    });
    assert.equal(out.reason, 'searches_empty_seed');
    assert.equal(out.wrote, false);
    assert.equal(posts, 0);
  });

  it('change handler missing queries field is skipped not thrown', async () => {
    let posts = 0;
    const result = await handleChangeEvent({
      event: {
        kind: 'searches',
        hostkey: HOST,
        guid: GUID,
        key: `${HOST}/${GUID}/searches.json`,
        etag: 'x',
      },
      getObject: async () => ({ Body: '{}' }),
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

  it('drainOnce catch maps handler throw to retry and still deletes sibling', async () => {
    const deleted = [];
    const out = await drainOnce({
      queueUrl: 'https://sqs.example/changes',
      maxMessages: 2,
      waitTimeSeconds: 0,
      receiveMessage: async () => ({
        Messages: [
          {
            MessageId: 'throw',
            ReceiptHandle: 'r-throw',
            Body: JSON.stringify({
              kind: 'searches',
              hostkey: HOST,
              guid: GUID,
              key: `${HOST}/${GUID}/searches.json`,
            }),
          },
          {
            MessageId: 'ok',
            ReceiptHandle: 'r-ok',
            Body: JSON.stringify({
              kind: 'other',
              hostkey: HOST,
              guid: GUID,
              key: `${HOST}/${GUID}/x.txt`,
            }),
          },
        ],
      }),
      deleteMessage: async (input) => {
        deleted.push(input.ReceiptHandle);
      },
      changeMessageVisibility: async () => {},
      getObject: async () => {
        throw new Error('forced_handler_throw');
      },
      headObject: async () => ({ Metadata: {} }),
      postSearch: async () => ({ ok: true, searchid: 'n' }),
    });
    assert.equal(out.processed, 2);
    assert.ok(deleted.includes('r-ok'));
    assert.ok(!deleted.includes('r-throw'));
    const bad = out.actions.find((a) => a.messageId === 'throw');
    assert.equal(bad.action, 'retry');
    assert.match(String(bad.detail), /forced_handler_throw/);
  });
});
