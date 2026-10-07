'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { writeResults } = require('../shared/writeResults');
const { resultsKey } = require('../shared/resultsPath');

describe('MRB #44 hostile: FR-009 writeResults', () => {
  it('PutObject Bucket/Key match resultsKey; stub schema fields', async () => {
    const calls = [];
    const job = {
      env: 'live',
      source: 'amazon',
      userId: 'ABC12345',
      catalogId: 123,
      searchId: 'srch_01JEXAMPLE',
    };
    await writeResults({
      ...job,
      envVars: { S3_RESULTS_BUCKET: 'test-bucket' },
      putObject: async (args) => {
        calls.push(args);
      },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].Bucket, 'test-bucket');
    assert.equal(calls[0].Key, resultsKey(job));
    const body = JSON.parse(calls[0].Body);
    assert.equal(body.searchId, job.searchId);
    assert.equal(body.source, job.source);
    assert.equal(body.userId, job.userId);
    assert.deepEqual(body.products, []);
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
      /S3_RESULTS_BUCKET|bucket/i
    );
  });
});
