'use strict';

/**
 * Amazon live provider worker (FR-030).
 * PA-API SearchItems -> normalize -> writeResults (injectable HTTP + putObject).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../worker/lib/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
const {
  searchAmazon,
  assertAmazonCreds,
  AmazonCredsError,
} = require('./search');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchAmazon?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  // Fail fast with a clear error before any HTTP / S3 call.
  assertAmazonCreds(envVars);

  const searchFn =
    deps && typeof deps.searchAmazon === 'function'
      ? deps.searchAmazon
      : searchAmazon;
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
  EnvIsolationError,
  // test helper path
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
