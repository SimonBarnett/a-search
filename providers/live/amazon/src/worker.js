'use strict';

/**
 * Amazon live provider worker (FR-030 / FR-183 / FR #4562).
 * Default: Creators API -> normalize -> a-clubs IN/ (writeLiveProviderInResult).
 * Explicit AMAZON_SEARCH_API=paapi keeps PA-API SearchItems.
 * Fail-closed if Creators creds missing while Creators path is selected.
 * FR #4562: paapi_non_json / creators_non_json -> status IN, no DLQ burn.
 * FR #4739: creators_not_eligible (AssociateNotEligible) -> same.
 */

const path = require('node:path');
const { applyBundledProviderEnv } = require('../../../../shared/loadBundledProviderEnv');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeLiveProviderInResult } = require('../../../../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../../../../shared/search/handleSqsWith429');
const { attachDefaultS3 } = require('../../../../shared/search/liveWorkerS3');
const {
  isAmazonPermanentVendorFault,
} = require('../../../../shared/search/backoff429');
const {
  searchAmazon,
  assertAmazonCreds,
  AmazonCredsError,
} = require('./search');
const {
  searchAmazonCreators,
  isCreatorsSearchEnabled,
  assertCreatorsCreds,
  AmazonCreatorsCredsError,
} = require('./creatorsSearch');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchAmazon?: Function,
 *   searchAmazonCreators?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  if (!(deps && deps.env)) applyBundledProviderEnv(__dirname);
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  const useCreators = isCreatorsSearchEnabled(envVars);
  let searchFn;
  if (useCreators) {
    // Fail-closed before any HTTP / S3 call when Creators flag is on.
    assertCreatorsCreds(envVars);
    searchFn =
      deps && typeof deps.searchAmazonCreators === 'function'
        ? deps.searchAmazonCreators
        : searchAmazonCreators;
  } else {
    assertAmazonCreds(envVars);
    searchFn =
      deps && typeof deps.searchAmazon === 'function'
        ? deps.searchAmazon
        : searchAmazon;
  }

  const liveS3 = attachDefaultS3(deps);
  const writeOpts = {
    msg,
    source: 'amazon',
    queries: msg.queries,
    exclude: msg.exclude,
    envVars,
    putObject: liveS3.putObject,
    touchLastmod: deps && deps.touchLastmod,
    headObject: liveS3.headObject,
    getObject: liveS3.getObject,
    copyObject: liveS3.copyObject,
    getObjectTagging: liveS3.getObjectTagging,
    putObjectTagging: liveS3.putObjectTagging,
    now: deps && deps.now,
  };

  let products;
  try {
    products = await searchFn(msg, {
      env: envVars,
      httpRequest: deps && deps.httpRequest,
    });
  } catch (err) {
    // FR #4562 / #4739: permanent Amazon vendor faults (non-JSON HTML or
    // Creators AssociateNotEligible). Write status IN; do not burn DLQ.
    if (isAmazonPermanentVendorFault(err)) {
      const code = err && typeof err.code === 'string' ? err.code : '';
      const status = {
        code,
        httpStatus: err.status,
        message: err && err.message ? String(err.message) : String(err),
        bodyPreview:
          err && err.bodyText != null
            ? String(err.bodyText).slice(0, 200)
            : undefined,
      };
      const written = await writeLiveProviderInResult({
        ...writeOpts,
        products: [],
        status,
      });
      return {
        ok: true,
        skipped:
          code === 'creators_not_eligible'
            ? 'creators_not_eligible'
            : 'vendor_non_json',
        source: 'amazon',
        searchId: msg.searchId,
        env: msg.env,
        products: [],
        key: written.key,
        bucket: written.bucket,
        searchApi: useCreators ? 'creators' : 'paapi',
        status,
      };
    }
    throw err;
  }

  const written = await writeLiveProviderInResult({
    ...writeOpts,
    products,
  });

  return {
    ok: true,
    source: 'amazon',
    searchId: msg.searchId,
    env: msg.env,
    products,
    key: written.key,
    bucket: written.bucket,
    searchApi: useCreators ? 'creators' : 'paapi',
  };
}

/**
 * SQS Lambda entry (FR-038 / FR-036 CDK `worker.handler`).
 * Implementation lives in `handler.js`; this wrapper keeps the FR-036
 * `async function handler` export pin on worker.js.
 */
async function handler(event, deps) {
  return require('./handler').handler(event, deps);
}

module.exports = {
  handler,
  run,
  AmazonCredsError,
  AmazonCreatorsCredsError,
  EnvIsolationError,
  // test helper path
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
