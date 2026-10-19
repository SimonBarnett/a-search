'use strict';

/**
 * FR #4436: missing provider credentials must not file intake fatals.
 * Config gap (e.g. CJ_API_TOKEN unset) still throws for SQS/DLQ, but
 * reportException is skipped — same class as env isolation / transient HTTP.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  handleSqsWith429,
  isMissingCredentials,
} = require('../shared/search/handleSqsWith429');
const { CjCredsError } = require('../providers/live/cj/src/search');

const ROOT = path.join(__dirname, '..');

describe('FR #4436 missing_credentials skip intake', () => {
  it('isMissingCredentials matches cj_missing_credentials / CredsError', () => {
    const e = new CjCredsError(
      'CJ GraphQL credentials missing: CJ_API_TOKEN. Set them in providers/live/cj/.env (never commit).',
    );
    assert.equal(e.code, 'cj_missing_credentials');
    assert.equal(isMissingCredentials(e), true);

    const plain = new Error('nope');
    plain.code = 'amazon_missing_credentials';
    assert.equal(isMissingCredentials(plain), true);

    const named = new Error('x');
    named.name = 'EbayCredsError';
    assert.equal(isMissingCredentials(named), true);

    const hard = new Error('boom');
    hard.status = 500;
    assert.equal(isMissingCredentials(hard), false);
    assert.equal(isMissingCredentials(null), false);
  });

  it('handleSqsWith429 rethrows CjCredsError without reportException', async () => {
    const intake = [];
    const err = new CjCredsError(
      'CJ GraphQL credentials missing: CJ_API_TOKEN. Set them in providers/live/cj/.env (never commit).',
    );

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's1', env: 'live' }),
                receiptHandle: 'rh-cj',
              },
            ],
          },
          run: async () => {
            throw err;
          },
          reportException: async (args) => {
            intake.push(args);
          },
          route: 'providers/live/cj/handler',
          source: 'cj',
        }),
      (e) => e === err,
    );

    assert.equal(intake.length, 0, 'missing credentials must not file intake fatal');
  });

  it('handleSqsWith429 still reports hard non-creds failures', async () => {
    const intake = [];
    const hard = new Error('unexpected');
    hard.code = 'cj_graphql_http_500';

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's1', env: 'live' }),
                receiptHandle: 'rh-hard',
              },
            ],
          },
          run: async () => {
            throw hard;
          },
          reportException: async (args) => {
            intake.push(args);
          },
          route: 'providers/live/cj/handler',
          source: 'cj',
        }),
      (e) => e === hard,
    );

    assert.equal(intake.length, 1, 'non-creds hard errors still file intake');
  });

  it('source pins contiguous FR #4436 missing-credentials skip', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared/search/handleSqsWith429.js'),
      'utf8',
    );
    assert.match(src, /function isMissingCredentials/);
    assert.match(src, /_missing_credentials/);
    assert.match(src, /isMissingCredentials\(err\)/);
    assert.match(src, /FR #4436/);
  });
});
