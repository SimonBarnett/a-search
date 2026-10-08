'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { writeResults } = require('../shared/writeResults');
const { resultsKey } = require('../shared/resultsPath');

describe('FR-033 default S3 PutObject in writeResults', () => {
  it('mock S3 client receives Bucket/Key/Body at canonical key', async () => {
    const sends = [];
    const job = {
      env: 'live',
      source: 'amazon',
      userId: 'ABC12345',
      catalogId: 123,
      searchId: 'srch_01JS3',
      products: [{ id: 'p1', title: 't' }],
    };
    const expectedKey = resultsKey(job);

    const result = await writeResults({
      ...job,
      envVars: { S3_RESULTS_BUCKET: 'results-bucket' },
      // FR-054d mapping registration uses S3 too; isolate PutObject path here.
      registerMapping: false,
      createS3Client: () => ({
        send: async (input) => {
          sends.push(input);
          return { ETag: '"etag"' };
        },
      }),
    });

    assert.equal(sends.length, 1);
    assert.equal(sends[0].Bucket, 'results-bucket');
    assert.equal(sends[0].Key, expectedKey);
    assert.equal(
      expectedKey,
      'live/amazon/ABC12345/123/srch_01JS3.json',
    );
    assert.equal(sends[0].ContentType, 'application/json');
    const body = JSON.parse(sends[0].Body);
    assert.equal(body.searchId, job.searchId);
    assert.equal(body.source, 'amazon');
    assert.deepEqual(body.products, [{ id: 'p1', title: 't' }]);
    assert.equal(result.key, expectedKey);
    assert.equal(result.bucket, 'results-bucket');
  });

  it('injected putObject still preferred over S3 client', async () => {
    const puts = [];
    await writeResults({
      env: 'sandbox',
      source: 'ebay',
      userId: 'U1',
      catalogId: 1,
      searchId: 'srch_x',
      envVars: { S3_RESULTS_BUCKET: 'b' },
      registerMapping: false,
      putObject: async (args) => {
        puts.push(args);
      },
      createS3Client: () => {
        throw new Error('should not create S3 client when putObject set');
      },
    });
    assert.equal(puts.length, 1);
    assert.equal(puts[0].Bucket, 'b');
  });
});
