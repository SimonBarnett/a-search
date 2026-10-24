'use strict';

/**
 * MRB #4831 hostile pins for FR #4827: excluded keys, hash quiet-path,
 * unknown SEA worker, serviceLoop empty-receive (no extra sleep).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { parseChangeEvent, isExcludedKey } = require('../shared/aClubs/changeEvents');
const { shouldPostSearch, searchesContentHash } = require('../shared/aClubs/searchesHash');
const { loadLocalWorker } = require('../walrus/src/runJob');
const { serviceLoop, DEFAULT_SWEEP_MS } = require('../redqueen/src/run');

describe('MRB #4831 hostile FR #4827', () => {
  it('excludes IN/ and search-fanout so service writes do not re-enter the annotator', () => {
    assert.equal(isExcludedKey('mmfc.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/srch-sql.json'), true);
    assert.equal(isExcludedKey('mmfc.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/in/x.json'), true);
    assert.equal(isExcludedKey('mmfc.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/search-fanout.json'), true);
    assert.equal(
      parseChangeEvent({
        source: 'aws.s3',
        detail: {
          object: {
            key: 'mmfc.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/IN/srch-sql.json',
            etag: 'e',
          },
        },
      }),
      null,
    );
    const widget = parseChangeEvent({
      source: 'aws.s3',
      detail: {
        object: {
          key: 'mmfc.example/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/widget.json',
          etag: '"AbC"',
        },
      },
    });
    assert.equal(widget.kind, 'widget');
    assert.equal(widget.etag, 'abc');
  });

  it('shouldPostSearch stays quiet when searchid exists and marker has no hash yet', () => {
    const queries = [{ q: 'pads' }];
    const hash = searchesContentHash({ queries, exclude: [] });
    assert.equal(
      shouldPostSearch({
        doc: { queries, exclude: [], searchid: 'srch_old' },
        markerMeta: {},
      }),
      false,
    );
    assert.equal(
      shouldPostSearch({
        doc: { queries, exclude: [], searchid: 'srch_old' },
        markerMeta: { searcheshash: hash },
      }),
      false,
    );
    assert.equal(
      shouldPostSearch({
        doc: { queries: [{ q: 'new' }], exclude: [], searchid: 'srch_old' },
        markerMeta: { searcheshash: hash },
      }),
      true,
    );
    assert.equal(
      shouldPostSearch({
        doc: { queries, exclude: [] },
        markerMeta: { searcheshash: hash },
      }),
      true,
    );
  });

  it('loadLocalWorker refuses an unknown source so SEA does not dynamic-require', () => {
    assert.throws(() => loadLocalWorker('not-a-provider'), /local_worker_missing:not-a-provider/);
    assert.equal(typeof loadLocalWorker('sql').run, 'function');
  });

  it('serviceLoop does not sleep after an empty drain; REDQUEEN_POLL_MS is error-only', async () => {
    assert.equal(DEFAULT_SWEEP_MS, 900000);
    const sleeps = [];
    const drains = [];
    await serviceLoop(
      { queueUrl: 'https://sqs.example/folders.fifo' },
      {
        sweep: async () => ({ scanned: 0, hosts: 0, actions: [] }),
        drain: async () => {
          drains.push(1);
          return { processed: 0, actions: [] };
        },
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        now: () => 0,
        sweepMs: 900000,
        errorSleepMs: 5000,
        maxLoops: 3,
      },
    );
    assert.equal(drains.length, 3);
    assert.deepEqual(sleeps, []);
  });
});
