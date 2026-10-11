'use strict';

/**
 * Amazon live provider worker (FR-030 / FR-183).
 * Default: PA-API SearchItems -> normalize -> writeResults.
 * When AMAZON_SEARCH_API=creators (or AMAZON_CREATORS_ENABLED), use Creators
 * client instead (FR-181/182). Fail-closed if Creators creds missing while flag on.
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
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

  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
  });

  const written = await writeResults({
    env: msg.env,
    source: 'amazon',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
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
