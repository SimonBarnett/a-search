'use strict';

/**
 * docs/mrb-4429 hostile pins for FR #4427 / PR #4429:
 * - Creators non-JSON path attaches status/code (parity with PA-API)
 * - Hard HTTP 500 still files intake (transient skip is not a blanket mute)
 * - Contiguous shared helpers: isTransientVendorHttp + handleSqsWith429 skip
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isTransientVendorHttp,
  backoffFor429,
} = require('../shared/search/backoff429');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

const ROOT = path.join(__dirname, '..');

describe('docs/mrb-4429 hostile FR #4427', () => {
  it('Creators defaultCreatorsHttpRequest attaches status on non-JSON 503', async () => {
    const { searchAmazonCreators } = require('../providers/live/amazon/src/creatorsSearch');
    const prev = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => '<html>Service Unavailable</html>',
    });
    const creatorsEnv = {
      AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
      AMAZON_PARTNER_TAG: 'tag-20',
      AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/search',
      AMAZON_SEARCH_API: 'creators',
    };
    try {
      await assert.rejects(
        () =>
          searchAmazonCreators(
            { q: 'boots', userId: 'U1', env: 'sandbox', searchId: 's1' },
            { env: creatorsEnv },
          ),
        (err) => {
          assert.match(String(err && err.message), /Creators non-JSON response \(503\)/);
          assert.equal(err.status, 503);
          assert.equal(err.code, 'creators_non_json');
          return true;
        },
      );
    } finally {
      global.fetch = prev;
    }
  });

  it('handleSqsWith429 still reports intake on hard 500', async () => {
    const vis = [];
    const intake = [];
    const err500 = new Error('Amazon PA-API HTTP 500: boom');
    err500.status = 500;

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's1', env: 'sandbox' }),
                receiptHandle: 'rh-500',
              },
            ],
          },
          run: async () => {
            throw err500;
          },
          changeMessageVisibility: async (args) => {
            vis.push(args);
          },
          reportException: async (args) => {
            intake.push(args);
          },
          route: 'providers/live/amazon/handler',
          source: 'amazon',
        }),
      (err) => err === err500,
    );

    assert.equal(vis.length, 0, 'hard 500 must not get 429-style visibility backoff');
    assert.equal(intake.length, 1, 'hard 500 must still file intake');
    assert.equal(isTransientVendorHttp(err500), false);
    assert.equal(backoffFor429({ err: err500 }).is429, false);
  });

  it('source pins contiguous FR #4427 transient helpers', () => {
    const backoff = fs.readFileSync(
      path.join(ROOT, 'shared/search/backoff429.js'),
      'utf8',
    );
    const handle = fs.readFileSync(
      path.join(ROOT, 'shared/search/handleSqsWith429.js'),
      'utf8',
    );
    const search = fs.readFileSync(
      path.join(ROOT, 'providers/live/amazon/src/search.js'),
      'utf8',
    );
    const creators = fs.readFileSync(
      path.join(ROOT, 'providers/live/amazon/src/creatorsSearch.js'),
      'utf8',
    );
    assert.match(backoff, /function isTransientVendorHttp/);
    assert.match(backoff, /status === 502 \|\| status === 503 \|\| status === 504/);
    assert.match(handle, /transient vendor HTTP \(429\/502\/503\/504\)/);
    assert.match(search, /paapi_non_json/);
    assert.match(creators, /creators_non_json/);
  });

  it('docs/sqs-pacing mentions 502/503/504 transient backoff', () => {
    const docs = fs.readFileSync(path.join(ROOT, 'docs/sqs-pacing.md'), 'utf8');
    assert.match(docs, /502/);
    assert.match(docs, /503/);
    assert.match(docs, /504/);
    assert.match(docs, /FR #4427|transient vendor/i);
  });
});
