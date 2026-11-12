'use strict';

/**
 * Hostile MRB #5332: skipped wire is {id, reason} only; sql never skipped.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handleSearch } = require('../entry/src/index');
const { providerMarkerKey } = require('../shared/affiliates/keys');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const REASONS = new Set([
  'missing_queue_url',
  'affiliates_enabled_0',
  'affiliates_folder_missing',
  'affiliates_s3_error',
  'invalid_provider_slug',
]);

describe('MRB #5332 hostile skipped body', () => {
  it('sql is queued and skipped entries use allowlisted reasons only', async () => {
    const clubs = {
      [`club.example/`]: { userid: 'MMFC0001' },
      [`club.example/${GUID}/`]: {},
    };
    const affiliates = {
      [providerMarkerKey('rakuten')]: { enabled: '1' },
    };
    const res = await handleSearch(
      {
        requestContext: {
          http: { method: 'POST', path: '/search' },
          authorizer: {
            iam: { userArn: 'arn:aws:iam::123456789012:user/a-search-redqueen-annotator' },
          },
        },
        body: JSON.stringify({
          hostkey: 'club.example',
          guid: GUID,
          queries: ['q'],
        }),
      },
      {
        env: {
          SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
          SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        },
        headObject: async ({ Key }) => {
          if (!(Key in clubs)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: clubs[Key] };
        },
        headAffiliatesObject: async ({ Key }) => {
          if (!(Key in affiliates)) {
            const err = new Error('missing');
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Metadata: affiliates[Key] };
        },
        sendMessage: async () => {},
        newSearchId: () => 'srch_mrb5332',
        enabled: () => ['rakuten'],
        loadRegistry: () => ({
          sources: [
            {
              id: 'rakuten',
              kind: 'live',
              awsSearch: true,
              queueEnv: 'SQS_RAKUTEN_URL',
            },
          ],
        }),
      },
    );
    const body = JSON.parse(res.body);
    assert.ok(body.queued.includes('sql'));
    assert.ok(!body.skipped.some((s) => s.id === 'sql'));
    for (const s of body.skipped) {
      assert.deepEqual(Object.keys(s).sort(), ['id', 'reason']);
      assert.ok(REASONS.has(s.reason), s.reason);
    }
  });

  it('docs/search-fanout.md names skipped array and sql stays queued', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'search-fanout.md'),
      'utf8',
    );
    assert.match(text, /skipped: \[\{ id, reason \}/);
    assert.match(text, /`sql` stays queued/);
    assert.doesNotMatch(text, /Closes #5314/);
  });
});
