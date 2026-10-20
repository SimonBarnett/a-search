'use strict';

/**
 * FR #4739: Creators HTTP 403 AssociateNotEligible is permanent — write status IN,
 * complete SQS, do not intake-fatal / DLQ-burn.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isAmazonNonJsonFault,
  isAmazonPermanentVendorFault,
  isTransientVendorHttp,
} = require('../shared/search/backoff429');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');
const { run } = require('../providers/live/amazon/src/worker');
const {
  searchAmazonCreators,
  classifyCreatorsHttpFault,
} = require('../providers/live/amazon/src/creatorsSearch');

const ROOT = path.join(__dirname, '..');

const creatorsEnv = {
  A_SEARCH_ENV: 'sandbox',
  AMAZON_CREATORS_CREDENTIAL: 'FAKE_CREATORS_CREDENTIAL',
  AMAZON_PARTNER_TAG: 'tag-20',
  AMAZON_CREATORS_ENDPOINT: 'https://example.test/creators/v1/searchItems',
  AMAZON_SEARCH_API: 'creators',
  S3_RESULTS_BUCKET: 'bucket-test',
};

const body403 = JSON.stringify({
  message: 'Your account does not currently meet the eligibility requirements.',
  reason: 'AssociateNotEligible',
  type: 'AccessDeniedException',
});

describe('FR #4739 Amazon Creators AssociateNotEligible', () => {
  it('classifyCreatorsHttpFault tags AssociateNotEligible 403', () => {
    assert.equal(
      classifyCreatorsHttpFault(403, JSON.parse(body403), body403),
      'creators_not_eligible',
    );
    assert.equal(
      classifyCreatorsHttpFault(403, { message: 'forbidden' }, 'forbidden'),
      null,
    );
    assert.equal(classifyCreatorsHttpFault(500, {}, 'boom'), null);
  });

  it('permanent helper includes creators_not_eligible; not transient', () => {
    const err = new Error('Amazon Creators HTTP 403: AssociateNotEligible');
    err.status = 403;
    err.code = 'creators_not_eligible';
    assert.equal(isAmazonPermanentVendorFault(err), true);
    assert.equal(isAmazonNonJsonFault(err), false);
    assert.equal(isTransientVendorHttp(err), false);
  });

  it('defaultCreatorsHttpRequest attaches creators_not_eligible on 403 body', async () => {
    const prev = global.fetch;
    global.fetch = async () => ({
      ok: false,
      status: 403,
      text: async () => body403,
    });
    try {
      await assert.rejects(
        () =>
          searchAmazonCreators(
            { q: 'servo', userId: 'U1', env: 'sandbox', searchId: 's1' },
            { env: creatorsEnv },
          ),
        (err) => {
          assert.equal(err.code, 'creators_not_eligible');
          assert.equal(err.status, 403);
          assert.equal(err.nonRetryable, true);
          assert.match(String(err.message), /403/);
          return true;
        },
      );
    } finally {
      global.fetch = prev;
    }
  });

  it('worker writes status IN and does not throw', async () => {
    const puts = [];
    const out = await run(
      {
        searchId: 'srch_4739',
        userId: 'U-4739',
        env: 'sandbox',
        source: 'amazon',
        q: 'servo',
        host: 'example.test',
        guid: 'g-4739',
      },
      {
        env: creatorsEnv,
        httpRequest: async () => {
          const err = new Error(`Amazon Creators HTTP 403: ${body403.slice(0, 80)}`);
          err.status = 403;
          err.code = 'creators_not_eligible';
          err.nonRetryable = true;
          err.body = JSON.parse(body403);
          throw err;
        },
        putObject: async (args) => {
          puts.push(args);
          return {};
        },
      },
    );
    assert.equal(out.ok, true);
    assert.equal(out.skipped, 'creators_not_eligible');
    assert.equal(out.products.length, 0);
    assert.equal(out.status.code, 'creators_not_eligible');
    assert.ok(puts.length >= 1);
    const body = JSON.parse(puts[0].Body.toString('utf8'));
    assert.equal(body.status.code, 'creators_not_eligible');
  });

  it('handleSqsWith429 completes batch without intake on creators_not_eligible', async () => {
    const intake = [];
    const err = new Error('Amazon Creators HTTP 403');
    err.status = 403;
    err.code = 'creators_not_eligible';
    err.nonRetryable = true;

    const result = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({
              searchId: 's1',
              env: 'sandbox',
              userId: 'U1',
            }),
            receiptHandle: 'rh-1',
          },
        ],
      },
      run: async () => {
        throw err;
      },
      reportException: async (args) => {
        intake.push(args);
      },
      route: 'providers/live/amazon/handler',
      source: 'amazon',
    });
    assert.equal(result.ok, true);
    assert.equal(result.results[0].skipped, 'creators_not_eligible');
    assert.equal(intake.length, 0);
  });

  it('source pins classify + permanent fault helper', () => {
    const creators = fs.readFileSync(
      path.join(ROOT, 'providers/live/amazon/src/creatorsSearch.js'),
      'utf8',
    );
    const backoff = fs.readFileSync(
      path.join(ROOT, 'shared/search/backoff429.js'),
      'utf8',
    );
    const worker = fs.readFileSync(
      path.join(ROOT, 'providers/live/amazon/src/worker.js'),
      'utf8',
    );
    assert.match(creators, /creators_not_eligible/);
    assert.match(creators, /AssociateNotEligible/);
    assert.match(backoff, /isAmazonPermanentVendorFault/);
    assert.match(worker, /isAmazonPermanentVendorFault|creators_not_eligible/);
  });
});
