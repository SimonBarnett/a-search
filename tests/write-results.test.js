'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { writeResults } = require('../worker/lib/writeResults');
const { resultsKey } = require('../shared/resultsPath');

describe('FR-009 writeResults to S3', () => {
  it('Mock S3 asserts Bucket/Key/Body; key matches helper', async () => {
    const calls = [];
    const job = {
      env: 'live',
      source: 'amazon',
      userId: 'ABC12345',
      catalogId: 123,
      searchId: 'srch_01JEXAMPLE',
    };
    const expectedKey = resultsKey(job);
    const result = await writeResults({
      ...job,
      products: [{ id: 'p1' }],
      envVars: { S3_RESULTS_BUCKET: 'test-bucket' },
      putObject: async (args) => {
        calls.push(args);
        return { ETag: '"x"' };
      },
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].Bucket, 'test-bucket');
    assert.equal(calls[0].Key, expectedKey);
    assert.equal(calls[0].ContentType, 'application/json');
    const body = JSON.parse(calls[0].Body);
    assert.equal(body.searchId, job.searchId);
    assert.equal(body.source, job.source);
    assert.equal(body.userId, job.userId);
    assert.deepEqual(body.products, [{ id: 'p1' }]);
    assert.equal(result.key, expectedKey);
    assert.equal(result.bucket, 'test-bucket');
  });

  it('defaults products to [] stub schema', async () => {
    const calls = [];
    await writeResults({
      env: 'sandbox',
      source: 'ebay',
      userId: 'U1',
      catalogId: 1,
      searchId: 'srch_x',
      envVars: { S3_RESULTS_BUCKET: 'b' },
      putObject: async (args) => {
        calls.push(args);
      },
    });
    const body = JSON.parse(calls[0].Body);
    assert.deepEqual(body, {
      searchId: 'srch_x',
      source: 'ebay',
      userId: 'U1',
      products: [],
    });
  });

  it('rejects missing S3_RESULTS_BUCKET', async () => {
    await assert.rejects(
      () =>
        writeResults({
          env: 'live',
          source: 'amazon',
          userId: 'U1',
          catalogId: 1,
          searchId: 'srch_x',
          envVars: {},
          putObject: async () => {},
        }),
      /S3_RESULTS_BUCKET/,
    );
  });
});
