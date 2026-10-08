'use strict';

/** FR-038: Amazon SQS Lambda handler wrapping run(msg) */
/** FR-445: reject paths must inject reportException (no live intake). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../providers/live/amazon/src/handler');
const worker = require('../providers/live/amazon/src/worker');
const { EnvIsolationError } = require('../shared/assertEnv');

const root = path.join(__dirname, '..');

/** @returns {{ reportException: Function, reports: object[], fetch: Function, fetches: object[] }} */
function mockIntakeDeps() {
  const reports = [];
  const fetches = [];
  return {
    reports,
    fetches,
    reportException: async (opts) => {
      reports.push(opts);
      return { ok: true, skipped: true };
    },
    // Defense in depth: if default reporter were used, block network.
    fetch: async (url, init) => {
      fetches.push({ url, init });
      throw new Error('FR-445: live intake fetch must not run in unit tests');
    },
  };
}

describe('FR-038 amazon SQS handler', () => {
  it('one SQS record → run called with parsed body', async () => {
    const calls = [];
    const intake = mockIntakeDeps();
    const msg = {
      searchId: 'srch_h1',
      userId: 'U1',
      env: 'sandbox',
      source: 'amazon',
      q: 'x',
    };
    const out = await handler(
      { Records: [{ body: JSON.stringify(msg) }] },
      {
        run: async (m) => {
          calls.push(m);
          return { ok: true, searchId: m.searchId };
        },
        reportException: intake.reportException,
        fetch: intake.fetch,
      },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].searchId, 'srch_h1');
    assert.equal(out.ok, true);
    assert.equal(out.results[0].searchId, 'srch_h1');
    assert.equal(intake.reports.length, 0);
    assert.equal(intake.fetches.length, 0);
  });

  it('bad JSON → throw (retry) without live intake', async () => {
    const intake = mockIntakeDeps();
    await assert.rejects(
      () =>
        handler(
          { Records: [{ body: '{not-json' }] },
          {
            run: async () => ({}),
            reportException: intake.reportException,
            fetch: intake.fetch,
          },
        ),
      /not valid JSON|JSON/i,
    );
    // Unexpected throw reports once via injected mock — never fetch.
    assert.equal(intake.reports.length, 1);
    assert.equal(intake.fetches.length, 0);
  });

  it('wrong-env msg → EnvIsolationError via real run (no report)', async () => {
    const intake = mockIntakeDeps();
    const msg = {
      searchId: 'srch_env',
      userId: 'U1',
      env: 'live',
      source: 'amazon',
      q: 'x',
    };
    await assert.rejects(
      () =>
        handler(
          { Records: [{ body: JSON.stringify(msg) }] },
          {
            run: async (m) =>
              worker.run(m, {
                env: {
                  A_SEARCH_ENV: 'sandbox',
                  AMAZON_ACCESS_KEY: 'a',
                  AMAZON_SECRET_KEY: 'b',
                  AMAZON_PARTNER_TAG: 't',
                  S3_RESULTS_BUCKET: 'bucket',
                },
              }),
            reportException: intake.reportException,
            fetch: intake.fetch,
          },
        ),
      (err) => err instanceof EnvIsolationError || err.name === 'EnvIsolationError',
    );
    assert.equal(intake.reports.length, 0);
    assert.equal(intake.fetches.length, 0);
  });

  it('fail-when: Lambda entrypoint exists (handler.js + worker.handler)', () => {
    const handlerPath = path.join(
      root,
      'providers',
      'live',
      'amazon',
      'src',
      'handler.js',
    );
    assert.ok(fs.existsSync(handlerPath), 'handler.js must exist');
    assert.equal(typeof require(handlerPath).handler, 'function');
    assert.equal(typeof worker.handler, 'function');
    assert.equal(typeof worker.run, 'function');
    const stack = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /worker\.handler|workerHandlerPath/);
  });
});
