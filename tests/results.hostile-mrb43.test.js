'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  resultsKey,
  resultsS3Uri,
  resultsRclonePath,
  ResultsPathError,
} = require('../worker/lib/resultsPath');

const FIX = {
  env: 'live',
  source: 'amazon',
  userId: 'ABC12345',
  catalogId: 123,
  searchId: 'srch_01JEXAMPLE',
};

describe('MRB #43 hostile: FR-008 results path', () => {
  it('exact key + S3 URI + rclone path for fixtures', () => {
    assert.equal(resultsKey(FIX), 'live/amazon/ABC12345/123/srch_01JEXAMPLE.json');
    assert.equal(
      resultsS3Uri({ bucket: 'my-results', ...FIX }),
      's3://my-results/live/amazon/ABC12345/123/srch_01JEXAMPLE.json'
    );
    const root = 'S:\\a-search';
    assert.equal(
      resultsRclonePath({ root, ...FIX }),
      path.join(root, 'live', 'amazon', 'ABC12345', '123', 'srch_01JEXAMPLE.json')
    );
  });

  it('rejects empty userId and empty searchId', () => {
    assert.throws(
      () => resultsKey({ ...FIX, userId: '' }),
      (err) => err instanceof ResultsPathError && err.code === 'empty_userId'
    );
    assert.throws(
      () => resultsKey({ ...FIX, searchId: '' }),
      (err) => err instanceof ResultsPathError && err.code === 'empty_searchId'
    );
  });
});
