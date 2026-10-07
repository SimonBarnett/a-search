'use strict';

/** FR-048d: amazon SQS handler fatal catch calls reportException */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../providers/live/amazon/src/handler');
const { EnvIsolationError } = require('../shared/assertEnv');

describe('FR-048d amazon handler → intake', () => {
  it('handler.js requires shared reportException', () => {
    const src = fs.readFileSync(
      path.join(
        __dirname,
        '..',
        'providers',
        'live',
        'amazon',
        'src',
        'handler.js',
      ),
      'utf8',
    );
    assert.match(src, /shared\/intake\/reportException/);
  });

  it('fatal run invokes reporter once then rethrows', async () => {
    const reports = [];
    const fatal = new Error('paapi down');
    fatal.code = 'paapi_boom';

    await assert.rejects(
      () =>
        handler(
          {
            Records: [
              {
                body: JSON.stringify({
                  searchId: 'srch_x',
                  userId: 'U1',
                  env: 'sandbox',
                  source: 'amazon',
                  q: 'x',
                }),
              },
            ],
          },
          {
            run: async () => {
              throw fatal;
            },
            reportException: async (opts) => {
              reports.push(opts);
              return { ok: true };
            },
          },
        ),
      (err) => err === fatal,
    );

    assert.equal(reports.length, 1);
    assert.equal(reports[0].err, fatal);
    assert.equal(reports[0].route, 'providers/live/amazon/handler');
    assert.equal(reports[0].source, 'amazon');
  });

  it('EnvIsolationError does not call reporter', async () => {
    const reports = [];
    const envErr = new EnvIsolationError('env_mismatch', 'nope');

    await assert.rejects(
      () =>
        handler(
          {
            Records: [
              {
                body: JSON.stringify({
                  searchId: 'srch_e',
                  userId: 'U1',
                  env: 'live',
                  source: 'amazon',
                  q: 'x',
                }),
              },
            ],
          },
          {
            run: async () => {
              throw envErr;
            },
            reportException: async (opts) => {
              reports.push(opts);
            },
          },
        ),
      (err) => err === envErr,
    );

    assert.equal(reports.length, 0);
  });
});
