'use strict';

/**
 * FR #4762: CJ HTTP non-JSON 403 "You are not Authorised..." is permanent —
 * status IN, complete SQS, no intake fatal / DLQ burn.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  classifyCjHttpFault,
  searchCj,
} = require('../providers/live/cj/src/search');
const { run } = require('../providers/live/cj/src/worker');
const { handleSqsWith429 } = require('../shared/search/handleSqsWith429');

const ROOT = path.join(__dirname, '..');

const credEnv = {
  A_SEARCH_ENV: 'sandbox',
  CJ_API_TOKEN: 'FAKE_CJ_TOKEN',
  CJ_WEBSITE_ID: '12345',
  CJ_GRAPHQL_URL: 'https://ads.api.cj.com/query',
  S3_RESULTS_BUCKET: 'bucket-test',
};

const body403 = 'You are not Authorised to perform this action';

describe('FR #4762 CJ not Authorised permanent skip', () => {
  it('classifyCjHttpFault tags 403 Authorised / Authorized text', () => {
    assert.equal(
      classifyCjHttpFault(403, null, body403),
      'cj_not_authorised',
    );
    assert.equal(
      classifyCjHttpFault(403, null, 'You are not Authorized to perform this action'),
      'cj_not_authorised',
    );
    assert.equal(classifyCjHttpFault(401, null, 'unauthorized'), 'cj_not_authorised');
    assert.equal(classifyCjHttpFault(403, null, 'rate limited somehow'), null);
    assert.equal(classifyCjHttpFault(500, null, 'boom'), null);
  });

  it('searchCj surfaces cj_not_authorised from defaultHttpRequest', async () => {
    const https = require('node:https');
    const prev = https.request;
    https.request = (opts, cb) => {
      const handlers = {};
      const req = {
        on(ev, fn) {
          handlers[ev] = fn;
          return req;
        },
        write() {},
        end() {
          const res = {
            statusCode: 403,
            on(ev, fn) {
              if (ev === 'data') fn(Buffer.from(body403));
              if (ev === 'end') {
                queueMicrotask(() => fn());
              }
              return res;
            },
          };
          cb(res);
        },
      };
      return req;
    };
    try {
      await assert.rejects(
        () =>
          searchCj(
            { q: 'servo', userId: 'U1', env: 'sandbox', searchId: 's1' },
            { env: credEnv },
          ),
        (err) => {
          assert.equal(err.code, 'cj_not_authorised');
          assert.equal(err.nonRetryable, true);
          assert.equal(err.statusCode, 403);
          assert.match(String(err.message), /non-JSON 403|Authorised/i);
          return true;
        },
      );
    } finally {
      https.request = prev;
    }
  });

  it('worker throws and does not write IN (FR #4769 DLQ)', async () => {
    const puts = [];
    await assert.rejects(
      () =>
        run(
          {
            searchId: 'srch_4762',
            userId: 'U-4762',
            env: 'sandbox',
            source: 'cj',
            q: 'servo',
            host: 'example.test',
            guid: 'g-4762',
          },
          {
            env: credEnv,
            httpRequest: async () => {
              const err = new Error(`CJ HTTP non-JSON 403: ${body403}`);
              err.statusCode = 403;
              err.status = 403;
              err.code = 'cj_not_authorised';
              err.nonRetryable = true;
              throw err;
            },
            putObject: async (args) => {
              puts.push(args);
              return {};
            },
          },
        ),
      (e) => e && e.code === 'cj_not_authorised',
    );
    assert.equal(puts.length, 0);
  });

  it('handleSqsWith429 throws without intake or IN on cj_not_authorised', async () => {
    const intake = [];
    const puts = [];
    const err = new Error(`CJ HTTP non-JSON 403: ${body403}`);
    err.statusCode = 403;
    err.code = 'cj_not_authorised';
    err.nonRetryable = true;

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({
                  searchId: 's1',
                  env: 'sandbox',
                  userId: 'U1',
                  source: 'cj',
                }),
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
          route: 'providers/live/cj/handler',
          source: 'cj',
        }),
      (e) => e === err,
    );
    assert.equal(intake.length, 0);
    assert.equal(puts.length, 0);
  });

  it('source pins classifyCjHttpFault + DLQ path', () => {
    const search = fs.readFileSync(
      path.join(ROOT, 'providers/live/cj/src/search.js'),
      'utf8',
    );
    const handle = fs.readFileSync(
      path.join(ROOT, 'shared/search/handleSqsWith429.js'),
      'utf8',
    );
    assert.match(search, /classifyCjHttpFault/);
    assert.match(search, /cj_not_authorised/);
    assert.match(search, /not Authori/);
    assert.match(handle, /cj_not_authorised/);
    assert.match(handle, /isProviderFaultForDlq/);
  });
});
