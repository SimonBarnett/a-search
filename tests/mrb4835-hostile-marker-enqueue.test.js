'use strict';

/**
 * MRB #4835 hostile pins for FR #4833: GUID case, missing queue URL,
 * widget.json never goes through the marker enqueue Lambda.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isHostOrGuidMarkerKey,
  kindFromKey,
} = require('../shared/aClubs/changeEvents');
const { enqueueAClubsChange } = require('../parts-gateway/src/enqueueAClubsChange');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'www.mymodelflyingclub.co.uk';

describe('MRB #4835 hostile marker enqueue', () => {
  it('accepts mixed-case GUID markers and rejects extra segments', () => {
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE/`), true);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/${GUID}/`), true);
    assert.equal(isHostOrGuidMarkerKey(`${HOST}/not-a-guid/`), false);
    assert.equal(kindFromKey(`${HOST}/not-a-guid/`), 'other');
  });

  it('throws when the changes queue URL is missing', async () => {
    await assert.rejects(
      () => enqueueAClubsChange({ key: `${HOST}/` }, { queueUrl: '', sendMessage: async () => {} }),
      /A_CLUBS_CHANGES_QUEUE_URL required/,
    );
  });

  it('does not enqueue widget.json or searches.json (those stay on direct SQS rules)', async () => {
    const sent = [];
    const deps = {
      queueUrl: 'https://sqs.example/a-clubs-changes',
      sendMessage: async (input) => {
        sent.push(input);
      },
    };
    const widget = await enqueueAClubsChange(
      { detail: { object: { key: `${HOST}/${GUID}/widget.json`, etag: 'w' } } },
      deps,
    );
    const searches = await enqueueAClubsChange(
      { detail: { object: { key: `${HOST}/${GUID}/searches.json`, etag: 's' } } },
      deps,
    );
    assert.equal(widget.enqueued, false);
    assert.equal(widget.skipped, 'not_host_guid_marker');
    assert.equal(searches.enqueued, false);
    assert.equal(searches.skipped, 'not_host_guid_marker');
    assert.equal(sent.length, 0);
  });
});
