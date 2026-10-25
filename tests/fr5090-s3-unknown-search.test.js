'use strict';

/**
 * FR #5090: S3 SDK UnknownError on HeadObject must not 500 /search
 * or intake as code Unknown.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleAgentSearch,
  applyAffiliatesEnabledFilter,
  AgentSearchError,
} = require('../entry/src/agentSearch');
const { handleSearch } = require('../entry/src/index');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function unknownS3() {
  const err = new Error('UnknownError');
  err.name = 'Unknown';
  err.$metadata = { httpStatusCode: 301 };
  return err;
}

describe('FR #5090 S3 Unknown on /search', () => {
  it('affiliates HeadObject Unknown skips that provider and keeps sql', async () => {
    const logs = [];
    const { queued, skipped } = await applyAffiliatesEnabledFilter(
      ['ebay', 'sql'],
      {
        headAffiliatesObject: async () => {
          throw unknownS3();
        },
        log: { info: (...a) => logs.push(a.join(' ')) },
      },
    );
    assert.deepEqual(queued, ['sql']);
    assert.equal(skipped[0].id, 'ebay');
    assert.equal(skipped[0].reason, 'affiliates_s3_error');
    assert.ok(logs.some((l) => /affiliates_s3_error/.test(l)));
    assert.ok(!logs.some((l) => /UnknownError/.test(l) && /secret/i.test(l)));
  });

  it('a-clubs guid HeadObject Unknown becomes AgentSearchError s3_head_failed', async () => {
    await assert.rejects(
      () =>
        handleAgentSearch({
          event: {
            body: {
              hostkey: 'club.example',
              guid: GUID,
              queries: ['q'],
            },
          },
          headObject: async () => {
            throw unknownS3();
          },
        }),
      (err) =>
        err instanceof AgentSearchError &&
        err.code === 's3_head_failed' &&
        err.statusCode === 503,
    );
  });

  it('handleSearch maps s3_head_failed to 503 not intake Unknown', async () => {
    const res = await handleSearch(
      {
        body: JSON.stringify({
          hostkey: 'club.example',
          guid: GUID,
          queries: ['q'],
        }),
      },
      {
        headObject: async () => {
          throw unknownS3();
        },
      },
    );
    assert.equal(res.statusCode, 503);
    const body = JSON.parse(res.body);
    assert.equal(body.error, 's3_head_failed');
    assert.notEqual(body.error, 'Unknown');
  });
});
