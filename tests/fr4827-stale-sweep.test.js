'use strict';

/**
 * FR #4827: stale marker sweep lists hosts before GUIDs.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { listStaleMarkers, runStaleSweep, isStaleMarkerMeta } = require('../redqueen/src/staleSweep');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const GUID2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('FR #4827 stale sweep', () => {
  it('stale when annotated is not 1 or lastmod is after lastupdate', () => {
    assert.equal(isStaleMarkerMeta({ annotated: '0' }), true);
    assert.equal(isStaleMarkerMeta({}), true);
    assert.equal(
      isStaleMarkerMeta({
        annotated: '1',
        lastmod: '2026-10-24T12:00:00.000Z',
        lastupdate: '2026-10-24T11:00:00.000Z',
      }),
      true,
    );
    assert.equal(
      isStaleMarkerMeta({
        annotated: '1',
        lastmod: '2026-10-24T11:00:00.000Z',
        lastupdate: '2026-10-24T12:00:00.000Z',
      }),
      false,
    );
  });

  it('lists stale markers hosts first and sweeps each host once', async () => {
    const meta = {
      'fresh.example/': {
        annotated: '1',
        lastmod: '2026-10-01T00:00:00.000Z',
        lastupdate: '2026-10-02T00:00:00.000Z',
        host: 'fresh.example',
      },
      'mmfc.example/': { annotated: '0', host: 'mmfc.example', lastmod: '2026-10-24T00:00:00.000Z' },
      [`mmfc.example/${GUID}/`]: {
        annotated: '1',
        host: 'mmfc.example',
        lastmod: '2026-10-24T02:00:00.000Z',
        lastupdate: '2026-10-24T01:00:00.000Z',
      },
      [`other.example/${GUID2}/`]: { annotated: '0', host: 'other.example' },
    };
    const keys = Object.keys(meta);
    const opts = {
      listObjectsV2: async () => ({
        Contents: keys.map((Key) => ({ Key })),
        IsTruncated: false,
      }),
      headObject: async ({ Key }) => ({ Metadata: meta[Key] }),
    };
    const listed = await listStaleMarkers(opts);
    assert.equal(listed.some((row) => row.key === 'fresh.example/'), false);
    assert.equal(listed[0].guid, undefined);
    assert.equal(listed[0].hostkey, 'mmfc.example');
    assert.ok(listed.slice(1).every((row) => row.guid));
    const hostIndex = listed.findIndex((row) => row.hostkey === 'mmfc.example' && !row.guid);
    const guidIndex = listed.findIndex((row) => row.guid === GUID);
    assert.ok(hostIndex >= 0 && hostIndex < guidIndex);

    const calls = [];
    const sweep = await runStaleSweep({
      ...opts,
      now: () => new Date('2026-10-24T15:00:00.000Z'),
      processFolderEvent: async (eventOpts) => {
        calls.push(eventOpts.event);
        return { action: 'host_processed' };
      },
    });
    assert.equal(sweep.scanned, listed.length);
    assert.equal(sweep.hosts, 2);
    assert.deepEqual(
      calls.map((c) => c.hostkey).sort(),
      ['mmfc.example', 'other.example'],
    );
    assert.equal(calls[0].hostkey, 'mmfc.example');
    assert.equal(calls[0].host, 'mmfc.example');
  });
});
