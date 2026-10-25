'use strict';

/**
 * MRB #5091 / FR #5090: hostile pins --- S3 Unknown must not 500 /search.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleAgentSearch,
  applyAffiliatesEnabledFilter,
  AgentSearchError,
} = require('../entry/src/agentSearch');
const { handleSearch } = require('../entry/src/index');

const ROOT = path.join(__dirname, '..');
const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function accessDeniedS3() {
  const err = new Error('Access Denied');
  err.name = 'AccessDenied';
  err.$metadata = { httpStatusCode: 403 };
  return err;
}

function unknownS3() {
  const err = new Error('UnknownError');
  err.name = 'Unknown';
  err.$metadata = { httpStatusCode: 301 };
  return err;
}

describe('MRB #5091 hostile FR #5090 S3 Unknown', () => {
  it('AccessDenied on affiliates HeadObject skips provider and keeps sql', async () => {
    const { queued, skipped } = await applyAffiliatesEnabledFilter(
      ['amazon', 'sql'],
      {
        headAffiliatesObject: async () => {
          throw accessDeniedS3();
        },
        log: { info() {} },
      },
    );
    assert.deepEqual(queued, ['sql']);
    assert.equal(skipped[0].reason, 'affiliates_s3_error');
  });

  it('host marker HeadObject Unknown is 503 s3_head_failed (not raw throw)', async () => {
    let guidOk = false;
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
          headObject: async ({ Key }) => {
            if (String(Key).endsWith(`${GUID}/`) || String(Key).includes(`/${GUID}/`)) {
              guidOk = true;
              return { Metadata: {} };
            }
            throw unknownS3();
          },
        }),
      (err) =>
        err instanceof AgentSearchError &&
        err.code === 's3_head_failed' &&
        err.statusCode === 503,
    );
    assert.equal(guidOk, true);
  });

  it('handleSearch never returns intake Unknown for guid HeadObject Unknown', async () => {
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
    assert.notEqual(body.error, 'UnknownError');
  });

  it('source + docs pin FR #5090 contracts', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'entry', 'src', 'agentSearch.js'),
      'utf8',
    );
    assert.match(src, /function wrapS3HeadFailure/);
    assert.match(src, /affiliates_s3_error/);
    assert.match(src, /s3_head_failed/);
    assert.match(src, /FR #5090/);
    const docs = fs.readFileSync(
      path.join(ROOT, 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(docs, /s3_head_failed/);
    assert.match(docs, /FR #5090/);
    assert.match(docs, /HeadObject/);
  });
});
