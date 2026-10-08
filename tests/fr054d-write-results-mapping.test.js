'use strict';

/** FR-054d: writeResults registers mapping entry after successful PutObject */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { writeResults } = require('../shared/writeResults');
const { resultsKey } = require('../shared/resultsPath');
const { getMapping } = require('../shared/mapping/mapping');
const {
  createMemoryS3Objects,
  createS3MappingStore,
  mappingObjectKey,
} = require('../shared/mapping/s3Store');

describe('FR-054d writeResults registers mapping', () => {
  it('injected upsertMapping is called after successful putObject', async () => {
    const puts = [];
    const upserts = [];
    const job = {
      env: 'live',
      source: 'amazon',
      userId: 'ABC12345',
      catalogId: 123,
      searchId: 'srch_01JS3',
      products: [{ id: 'p1' }],
    };
    const expectedKey = resultsKey(job);

    const result = await writeResults({
      ...job,
      envVars: { S3_RESULTS_BUCKET: 'results-bucket' },
      putObject: async (args) => {
        puts.push(args);
      },
      upsertMapping: async (row, deps) => {
        upserts.push({ row, deps });
        return { ...row, createdAt: '2026-10-08T00:00:00.000Z' };
      },
      mappingStore: {
        get: async () => null,
        put: async (_k, rec) => rec,
      },
    });

    assert.equal(puts.length, 1);
    assert.equal(puts[0].Key, expectedKey);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].row.userId, 'ABC12345');
    assert.equal(upserts[0].row.searchId, 'srch_01JS3');
    assert.equal(upserts[0].row.s3Key, expectedKey);
    assert.equal(upserts[0].row.tokenOrClickRef, 'srch_01JS3');
    assert.equal(result.mapping.s3Key, expectedKey);
  });

  it('writeResults mock store round-trip: getMapping finds upserted row', async () => {
    const backend = createMemoryS3Objects();
    const bucket = 'map-bucket';
    const store = createS3MappingStore({
      bucket,
      putObject: backend.putObject,
      getObject: backend.getObject,
    });
    const job = {
      env: 'sandbox',
      source: 'awin',
      userId: 'U1',
      catalogId: 9,
      searchId: 'srch_wire',
      tokenOrClickRef: 'clk_wire',
    };

    await writeResults({
      ...job,
      envVars: { S3_RESULTS_BUCKET: bucket },
      putObject: backend.putObject,
      getObject: backend.getObject,
      mappingStore: store,
    });

    const got = await getMapping(
      {
        env: 'sandbox',
        userId: 'U1',
        source: 'awin',
        token: 'clk_wire',
      },
      { store },
    );
    assert.ok(got);
    assert.equal(got.s3Key, resultsKey(job));
    assert.equal(got.searchId, 'srch_wire');

    const mapKey = mappingObjectKey({
      env: 'sandbox',
      userId: 'U1',
      source: 'awin',
      tokenOrClickRef: 'clk_wire',
    });
    assert.ok(backend.objects.has(`${bucket}/${mapKey}`));
    assert.ok(backend.objects.has(`${bucket}/${resultsKey(job)}`));
  });

  it('registerMapping:false skips upsert', async () => {
    const upserts = [];
    await writeResults({
      env: 'live',
      source: 'ebay',
      userId: 'U',
      catalogId: 1,
      searchId: 'srch_skip',
      envVars: { S3_RESULTS_BUCKET: 'b' },
      putObject: async () => ({}),
      registerMapping: false,
      upsertMapping: async (row) => {
        upserts.push(row);
        return row;
      },
      mappingStore: { get: async () => null, put: async (_k, r) => r },
    });
    assert.equal(upserts.length, 0);
  });
});
