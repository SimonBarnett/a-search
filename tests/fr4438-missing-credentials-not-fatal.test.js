'use strict';

/**
 * FR #4438: skimlinks_missing_credentials (and the same *_missing_credentials
 * class) must not be posted as an a-search fatal, and must not fail the SQS
 * batch so the message retries forever.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleSqsWith429,
  isMissingProviderCreds,
} = require('../shared/search/handleSqsWith429');

function credsErr(code) {
  const err = new Error(code);
  err.name = 'SkimlinksCredsError';
  err.code = code;
  return err;
}

describe('FR #4438 missing provider credentials', () => {
  it('recognises *_missing_credentials and ignores other codes', () => {
    assert.equal(isMissingProviderCreds(credsErr('skimlinks_missing_credentials')), true);
    assert.equal(isMissingProviderCreds(credsErr('amazon_missing_credentials')), true);
    assert.equal(isMissingProviderCreds(Object.assign(new Error('x'), { code: 'paapi_non_json' })), false);
    assert.equal(isMissingProviderCreds(new Error('boom')), false);
  });

  it('acks the record without intake when skimlinks creds are missing', async () => {
    const intake = [];
    const out = await handleSqsWith429({
      event: {
        Records: [
          {
            body: JSON.stringify({ searchId: 's1', env: 'live', source: 'skimlinks' }),
            receiptHandle: 'rh-skim',
          },
        ],
      },
      run: async () => {
        throw credsErr('skimlinks_missing_credentials');
      },
      reportException: async (args) => {
        intake.push(args);
      },
      route: 'providers/live/skimlinks/handler',
      source: 'skimlinks',
    });

    assert.equal(intake.length, 0);
    assert.equal(out.ok, true);
    assert.equal(out.results.length, 1);
    assert.equal(out.results[0].skipped, 'missing_credentials');
    assert.equal(out.results[0].code, 'skimlinks_missing_credentials');
    assert.equal(out.results[0].source, 'skimlinks');
  });

  it('still files intake and rethrows a real worker error', async () => {
    const intake = [];
    const boom = new Error('putObject_required');
    boom.code = 'putObject_required';
    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's2', env: 'live' }),
                receiptHandle: 'rh-2',
              },
            ],
          },
          run: async () => {
            throw boom;
          },
          reportException: async (args) => {
            intake.push(args.err && args.err.code);
          },
          route: 'providers/live/skimlinks/handler',
          source: 'skimlinks',
        }),
      (err) => err === boom,
    );
    assert.deepEqual(intake, ['putObject_required']);
  });
});
