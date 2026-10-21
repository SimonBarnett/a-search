'use strict';

/**
 * FR #4562: deploy default AMAZON_SEARCH_API=creators; Amazon non-JSON HTML
 * 4xx/5xx non-JSON is non-retryable (FR #4769: DLQ, no status IN). Real 429 still backs off.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isCreatorsSearchEnabled,
} = require('../providers/live/amazon/src/creatorsSearch');
const { run } = require('../providers/live/amazon/src/worker');
const {
  isTransientVendorHttp,
  backoffFor429,
  isAmazonNonJsonFault,
} = require('../shared/search/backoff429');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

const ROOT = path.join(__dirname, '..');

describe('FR #4562 Amazon Creators default + non-JSON no DLQ', () => {
  it('isCreatorsSearchEnabled defaults on; explicit paapi stays off', () => {
    assert.equal(isCreatorsSearchEnabled({}), true);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_SEARCH_API: '' }), true);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_SEARCH_API: 'creators' }), true);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_SEARCH_API: 'paapi' }), false);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_CREATORS_ENABLED: 'false' }), false);
    assert.equal(isCreatorsSearchEnabled({ AMAZON_CREATORS_ENABLED: '0' }), false);
  });

  it('stack plain defaults set AMAZON_SEARCH_API=creators', () => {
    // Read source (avoid requiring aws-cdk-lib in unit pins).
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk/lib/a-search-stack.js'),
      'utf8',
    );
    const plainBlock = stack.match(
      /PROVIDER_PLAIN_DEFAULTS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(plainBlock, 'PROVIDER_PLAIN_DEFAULTS block');
    assert.match(
      plainBlock[0],
      /amazon:\s*\{[^}]*AMAZON_SEARCH_API:\s*'creators'/,
    );
  });

  it('.env.example defaults AMAZON_SEARCH_API=creators', () => {
    const envEx = fs.readFileSync(
      path.join(ROOT, 'providers/live/amazon/.env.example'),
      'utf8',
    );
    assert.match(envEx, /AMAZON_SEARCH_API\s*=\s*creators/);
  });

  it('paapi_non_json / creators_non_json are not transient (no 3x DLQ burn)', () => {
    const err = Object.assign(new Error('Amazon PA-API non-JSON response (503)'), {
      status: 503,
      code: 'paapi_non_json',
      bodyText: '<html>Service Unavailable</html>',
    });
    assert.equal(isAmazonNonJsonFault(err), true);
    assert.equal(isTransientVendorHttp(err), false);
    assert.equal(backoffFor429({ err }).is429, false);

    const cErr = Object.assign(new Error('Creators non-JSON response (502)'), {
      status: 502,
      code: 'creators_non_json',
    });
    assert.equal(isAmazonNonJsonFault(cErr), true);
    assert.equal(isTransientVendorHttp(cErr), false);

    // Real 429 still backs off.
    assert.equal(isTransientVendorHttp({ status: 429 }), true);
    assert.equal(backoffFor429({ err: { status: 429 } }).is429, true);
  });

  it('worker throws on paapi_non_json without IN (FR #4769 DLQ)', async () => {
    /** @type {object[]} */
    const puts = [];
    await assert.rejects(
      () =>
        run(
          {
            hostkey: 'shop.example',
            guid: 'guid-1',
            searchid: 'srch_4562',
            searchId: 'srch_4562',
            env: 'sandbox',
            queries: ['boots'],
          },
          {
            env: {
              A_SEARCH_ENV: 'sandbox',
              AMAZON_SEARCH_API: 'paapi',
              AMAZON_ACCESS_KEY: 'FAKE_AKIA',
              AMAZON_SECRET_KEY: 'FAKE_SECRET',
              AMAZON_PARTNER_TAG: 'tag-20',
              AMAZON_HOST: 'webservices.amazon.co.uk',
              AMAZON_REGION: 'eu-west-1',
              A_CLUBS_BUCKET: 'a-clubs-test',
            },
            searchAmazon: async () => {
              const err = new Error('Amazon PA-API non-JSON response (503)');
              err.status = 503;
              err.code = 'paapi_non_json';
              err.bodyText = '<html>Service Unavailable</html>'.slice(0, 200);
              throw err;
            },
            putObject: async (args) => {
              puts.push(args);
            },
            touchLastmod: async () => {},
          },
        ),
      (e) => e && e.code === 'paapi_non_json',
    );
    assert.equal(puts.length, 0);
  });

  it('handleSqsWith429 throws on amazon non-json (FR #4769 DLQ; no intake)', async () => {
    const err = Object.assign(new Error('Amazon PA-API non-JSON response (503)'), {
      status: 503,
      code: 'paapi_non_json',
    });
    const intake = [];
    const puts = [];
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's1', env: 'sandbox' }),
                receiptHandle: 'rh-1',
              },
            ],
          },
          run: async () => {
            throw err;
          },
          deps: {
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
          },
          reportException: async (args) => {
            intake.push(args);
          },
          route: 'providers/live/amazon/handler',
          source: 'amazon',
        }),
      (e) => e === err,
    );
    assert.equal(intake.length, 0);
    assert.equal(puts.length, 0);
  });
});
