'use strict';

/**
 * Amazon live provider worker (FR-030 / FR-183 / FR #4562 / FR #4769).
 * Default: Creators API -> normalize -> a-clubs IN/ (writeLiveProviderInResult).
 * Explicit AMAZON_SEARCH_API=paapi keeps PA-API SearchItems.
 * Fail-closed if Creators creds missing while Creators path is selected.
 * FR #4769: API failures (incl. paapi_non_json / creators_not_eligible) throw;
 * handleSqsWith429 logs and fails the receive into the DLQ (no status IN).
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

  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
    sleep: deps && deps.sleep,
    creatorsCredential: deps && deps.creatorsCredential,
  });

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
