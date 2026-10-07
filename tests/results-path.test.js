'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  resultsKey,
  resultsS3Uri,
  resultsRclonePath,
  ResultsPathError,
} = require('../shared/resultsPath');

const FIX = {
  env: 'live',
  source: 'amazon',
  userId: 'ABC12345',
  catalogId: 123,
  searchId: 'srch_01JEXAMPLE',
};

describe('FR-008 results path helper', () => {
  it('exact key for fixtures', () => {
    assert.equal(
      resultsKey(FIX),
      'live/amazon/ABC12345/123/srch_01JEXAMPLE.json',
    );
  });

  it('S3 URI uses bucket + key', () => {
    assert.equal(
      resultsS3Uri({ bucket: 'my-results', ...FIX }),
      's3://my-results/live/amazon/ABC12345/123/srch_01JEXAMPLE.json',
    );
  });

  it('rclone path under A_SEARCH_RCLONE_ROOT', () => {
    const root = 'S:\\a-search';
    const p = resultsRclonePath({ root, ...FIX });
    assert.equal(
      p,
      path.join(root, 'live', 'amazon', 'ABC12345', '123', 'srch_01JEXAMPLE.json'),
    );
  });

  it('rejects empty userId', () => {
    assert.throws(
      () => resultsKey({ ...FIX, userId: '' }),
      (err) => err instanceof ResultsPathError && err.code === 'empty_userId',
    );
  });

  it('rejects empty searchId', () => {
    assert.throws(
      () => resultsKey({ ...FIX, searchId: '  ' }),
      (err) => err instanceof ResultsPathError && err.code === 'empty_searchId',
    );
  });

  it('rejects invalid env', () => {
    assert.throws(
      () => resultsKey({ ...FIX, env: 'prod' }),
      (err) => err instanceof ResultsPathError && err.code === 'invalid_env',
    );
  });
});
