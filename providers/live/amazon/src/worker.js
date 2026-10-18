'use strict';

/**
 * Amazon live provider worker (FR-030 / FR-183 / FR #4040).
 * Default: PA-API SearchItems -> a-clubs IN/ (agent) or writeResults.
 * When AMAZON_SEARCH_API=creators (or AMAZON_CREATORS_ENABLED), use Creators.
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const {
  finishProviderSearch,
  runSearchWith429Backoff,
} = require('../../../../shared/search/finishProviderSearch');
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
 * @param {object} [deps]
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

  const products = await runSearchWith429Backoff(
    () =>
      searchFn(msg, {
        env: envVars,
        httpRequest: deps && deps.httpRequest,
      }),
    deps,
  );

  const finished = await finishProviderSearch({
    msg,
    source: 'amazon',
    products,
    envVars,
    putObject: deps && deps.putObject,
    headObject: deps && deps.headObject,
    getObject: deps && deps.getObject,
    copyObject: deps && deps.copyObject,
    getObjectTagging: deps && deps.getObjectTagging,
    putObjectTagging: deps && deps.putObjectTagging,
    touchLastmod: deps && deps.touchLastmod,
  });

  return {
    ...finished,
    searchApi: useCreators ? 'creators' : 'paapi',
    env: msg.env,
  };
}

async function handler(event, deps) {
  return require('./handler').handler(event, deps);
}

module.exports = {
  handler,
  run,
  AmazonCredsError,
  AmazonCreatorsCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
