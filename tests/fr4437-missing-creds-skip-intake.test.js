'use strict';

/**
 * FR #4437 (+ twin intake fatals #4436/#4438/#4439/#4440): provider
 * *_missing_credentials must not spam /bob/v1/intake on every SQS retry.
 * Mirror env-isolation skip in handleSqsWith429; still rethrow for SQS/DLQ.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  handleSqsWith429,
  isMissingCredentials,
  isEnvIsolation,
} = require('../shared/search/handleSqsWith429');
const {
  RakutenCredsError,
  assertRakutenCreds,
} = require('../providers/live/rakuten/src/search');

describe('FR #4437 missing credentials skip intake', () => {
  it('isMissingCredentials matches code, CredsError name, and message', () => {
    assert.equal(
      isMissingCredentials({ code: 'rakuten_missing_credentials' }),
      true,
    );
    assert.equal(isMissingCredentials({ code: 'cj_missing_credentials' }), true);
    assert.equal(
      isMissingCredentials({ code: 'etsy_missing_credentials' }),
      true,
    );
    assert.equal(
      isMissingCredentials({ name: 'RakutenCredsError', message: 'x' }),
      true,
    );
    assert.equal(
      isMissingCredentials({
        message: 'Rakuten Product Search credentials missing: RAKUTEN_APPLICATION_KEY',
      }),
      true,
    );
    assert.equal(isMissingCredentials({ code: 'paapi_non_json' }), false);
    assert.equal(isMissingCredentials({ status: 500 }), false);
    assert.equal(isMissingCredentials(null), false);
  });

  it('isEnvIsolation still distinct from missing credentials', () => {
    assert.equal(
      isEnvIsolation({ name: 'EnvIsolationError', code: 'env_mismatch' }),
      true,
    );
    assert.equal(
      isMissingCredentials({ name: 'EnvIsolationError', code: 'env_mismatch' }),
      false,
    );
  });

  it('assertRakutenCreds throws RakutenCredsError with Secrets Manager hint', () => {
    assert.throws(
      () => assertRakutenCreds({}),
      (err) => {
        assert.ok(err instanceof RakutenCredsError);
        assert.equal(err.code, 'rakuten_missing_credentials');
        assert.match(String(err.message), /RAKUTEN_APPLICATION_KEY/);
        assert.match(String(err.message), /Secrets Manager|ProviderSecretArn|secret/i);
        return true;
      },
    );
  });

  it('handleSqsWith429 skips reportException for rakuten_missing_credentials', async () => {
    const intake = [];
    const err = new RakutenCredsError(
      'Rakuten Product Search credentials missing: RAKUTEN_APPLICATION_KEY',
    );

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({
                  searchId: 's1',
                  env: 'live',
                  q: 'boots',
                }),
                receiptHandle: 'rh-1',
              },
            ],
          },
          run: async () => {
            throw err;
          },
          reportException: async (opts) => {
            intake.push(opts);
          },
          route: 'providers/live/rakuten/handler',
          source: 'rakuten',
        }),
      (e) => e === err || e.code === 'rakuten_missing_credentials',
    );

    assert.equal(intake.length, 0, 'must not file intake fatal for missing creds');
  });

  it('handleSqsWith429 still reports non-cred fatals', async () => {
    const intake = [];
    const err = new Error('unexpected boom');
    err.code = 'unexpected';

    await assert.rejects(
      () =>
        handleSqsWith429({
          event: {
            Records: [
              {
                body: JSON.stringify({ searchId: 's1', env: 'live', q: 'x' }),
              },
            ],
          },
          run: async () => {
            throw err;
          },
          reportException: async (opts) => {
            intake.push(opts);
          },
          route: 'providers/live/rakuten/handler',
          source: 'rakuten',
        }),
      (e) => e === err,
    );

    assert.equal(intake.length, 1);
    assert.equal(intake[0].source, 'rakuten');
  });
});
