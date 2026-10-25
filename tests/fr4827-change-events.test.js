'use strict';

/**
 * FR #4827: EventBridge / S3 / compact change events.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isExcludedKey,
  parseChangeEvent,
  hostGuidFromKey,
  normEtag,
} = require('../shared/aClubs/changeEvents');

const GUID = 'AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE';
const HOST = 'mmfc.example';

describe('FR #4827 change events', () => {
  it('excludes IN/ and search-fanout.json', () => {
    assert.equal(isExcludedKey(`${HOST}/${GUID}/IN/srch-sql.json`), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/in/notes.json`), true);
    // FR #4917: DONE/ terminal records must not re-trigger annotation.
    assert.equal(isExcludedKey(`${HOST}/${GUID}/DONE/srch-amazon.json`), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/done/x.json`), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/search-fanout.json`), true);
    assert.equal(isExcludedKey(`${HOST}/${GUID}/widget.json`), false);
    assert.equal(isExcludedKey(`${HOST}/`), false);
  });

  it('hostGuidFromKey splits host marker, guid marker, and files', () => {
    assert.deepEqual(hostGuidFromKey(`${HOST}/`), { hostkey: HOST });
    assert.deepEqual(hostGuidFromKey(`${HOST}/${GUID}/`), {
      hostkey: HOST,
      guid: GUID.toLowerCase(),
    });
    assert.deepEqual(hostGuidFromKey(`${HOST}/${GUID}/widget.json`), {
      hostkey: HOST,
      guid: GUID.toLowerCase(),
    });
  });

  it('parses EventBridge, S3 Records, and compact JSON', () => {
    const eb = parseChangeEvent({
      source: 'aws.s3',
      'detail-type': 'Object Created',
      detail: {
        bucket: { name: 'a-clubs' },
        object: { key: `${HOST}/${GUID}/widget.json`, etag: '"ABC"' },
      },
    });
    assert.equal(eb.kind, 'widget');
    assert.equal(eb.hostkey, HOST);
    assert.equal(eb.guid, GUID.toLowerCase());
    assert.equal(eb.etag, 'abc');
    assert.equal(normEtag('"ABC"'), 'abc');

    const records = parseChangeEvent({
      Records: [
        {
          s3: {
            object: {
              key: encodeURIComponent(`${HOST}/${GUID}/searches.json`),
              eTag: 'etag1',
            },
          },
        },
      ],
    });
    assert.equal(records.kind, 'searches');
    assert.equal(records.key, `${HOST}/${GUID}/searches.json`);

    const marker = parseChangeEvent({ key: `${HOST}/`, etag: 'm1' });
    assert.equal(marker.kind, 'marker');
    assert.equal(marker.guid, undefined);

    const guidMarker = parseChangeEvent({ key: `${HOST}/${GUID}/` });
    assert.equal(guidMarker.kind, 'marker');
    assert.equal(guidMarker.guid, GUID.toLowerCase());

    const other = parseChangeEvent({ key: `${HOST}/${GUID}/notes.txt` });
    assert.equal(other.kind, 'other');
  });

  it('returns null for excluded keys and throws on garbage', () => {
    assert.equal(
      parseChangeEvent({ key: `${HOST}/${GUID}/IN/x.json`, etag: 'e' }),
      null,
    );
    assert.equal(
      parseChangeEvent({
        detail: { object: { key: `${HOST}/search-fanout.json` } },
      }),
      null,
    );
    assert.throws(() => parseChangeEvent('not-json'), (err) => err.code === 'invalid_change_event_json');
    assert.throws(() => parseChangeEvent({ hostkey: HOST, host: HOST }), (err) => err.code === 'invalid_change_event');
  });
});
