'use strict';

/** FR-038: Amazon SQS Lambda handler wrapping run(msg) */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../providers/live/amazon/src/handler');
const worker = require('../providers/live/amazon/src/worker');
const { EnvIsolationError } = require('../worker/lib/assertEnv');

const root = path.join(__dirname, '..');

describe('FR-038 amazon SQS handler', () => {
  it('one SQS record → run called with parsed body', async () => {
    const calls = [];
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
      },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].searchId, 'srch_h1');
    assert.equal(out.ok, true);
    assert.equal(out.results[0].searchId, 'srch_h1');
  });

  it('bad JSON → throw (retry)', async () => {
    await assert.rejects(
      () => handler({ Records: [{ body: '{not-json' }] }, { run: async () => ({}) }),
      /not valid JSON|JSON/i,
    );
  });

  it('wrong-env msg → EnvIsolationError via real run', async () => {
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
          },
        ),
      (err) => err instanceof EnvIsolationError || err.name === 'EnvIsolationError',
    );
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
    assert.match(stack, /worker\.handler/);
  });
});
