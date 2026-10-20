'use strict';

/**
 * FR #4427: Amazon PA-API HTML/non-JSON 503 must carry err.status.
 * FR #4562: coded paapi_non_json / creators_non_json complete the SQS batch
 * (status IN) instead of visibility backoff / DLQ burn; plain 502/503/504
 * without those codes still back off like 429.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isHttp429,
  isTransientVendorHttp,
  backoffFor429,
} = require('../shared/search/backoff429');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');
const { searchAmazon } = require('../providers/live/amazon/src/search');

const credEnv = {
  AMAZON_SEARCH_API: 'paapi',
  AMAZON_ACCESS_KEY: 'AKIATEST',
  AMAZON_SECRET_KEY: 'secret-test',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_HOST: 'webservices.amazon.co.uk',
  AMAZON_REGION: 'eu-west-1',
};

describe('FR #4427 PA-API non-JSON 503', () => {
  it('isTransientVendorHttp covers 429 and 502/503/504; leaves 500 alone', () => {
    assert.equal(isTransientVendorHttp({ status: 429 }), true);
    assert.equal(isTransientVendorHttp({ status: 503 }), true);
    assert.equal(isTransientVendorHttp({ statusCode: 502 }), true);
    assert.equal(isTransientVendorHttp({ status: 504 }), true);
    assert.equal(isTransientVendorHttp({ statusCode: 500 }), false);
    assert.equal(isHttp429({ statusCode: 500 }), false);
    assert.equal(
      isTransientVendorHttp({ status: 503, code: 'paapi_non_json' }),
      false,
      'FR #4562: coded Amazon non-JSON is not transient',
    );
  });

  it('backoffFor429 treats plain 503 as retryable visibility backoff', () => {
    const b = backoffFor429({ err: { status: 503 }, fallbackSec: 20 });
    assert.equal(b.is429, true);
    assert.equal(b.visibilityTimeout, 20);
  });

  it('searchAmazon defaultHttpRequest attaches status on non-JSON 503', async () => {
    const prev = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 503,
      text: async () => '<html>Service Unavailable</html>',
    });
    try {
      await assert.rejects(
        () =>
          searchAmazon(
            { q: 'boots', userId: 'U1', env: 'sandbox' },
            { env: credEnv },
          ),
        (err) => {
          assert.match(String(err && err.message), /non-JSON response \(503\)/);
          assert.equal(err.status, 503);
          assert.equal(err.code, 'paapi_non_json');
          return true;
        },
      );
    } finally {
      global.fetch = prev;
    }
  });

  it('handleSqsWith429 completes batch on paapi_non_json (no DLQ burn)', async () => {
    const vis = [];
    const intake = [];
    const err503 = new Error('Amazon PA-API non-JSON response (503)');
    err503.status = 503;
    err503.code = 'paapi_non_json';

    const result = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({ searchId: 's1', env: 'sandbox' }),
            receiptHandle: 'rh-1',
          },
        ],
      },
      run: async () => {
        throw err503;
      },
      changeMessageVisibility: async (args) => {
        vis.push(args);
      },
      reportException: async (args) => {
        intake.push(args);
      },
      route: 'providers/live/amazon/handler',
      source: 'amazon',
    });

    assert.equal(vis.length, 0, 'non-json must not visibility-backoff');
    assert.equal(intake.length, 0, 'non-json must not file intake fatal');
    assert.equal(result.results[0].skipped, 'vendor_non_json');
    assert.equal(result.results[0].code, 'paapi_non_json');
  });
});
