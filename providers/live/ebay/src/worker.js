'use strict';

/**
 * eBay live provider worker (FR-039).
 * Browse API search -> normalize -> a-clubs IN/ (writeLiveProviderInResult) (injectable HTTP + putObject).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeLiveProviderInResult } = require('../../../../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../../../../shared/search/handleSqsWith429');
const {
  searchEbay,
  assertEbayCreds,
  EbayCredsError,
} = require('./search');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchEbay?: Function,
 *   accessToken?: string,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  assertEbayCreds(envVars);

  const searchFn =
    deps && typeof deps.searchEbay === 'function'
      ? deps.searchEbay
      : searchEbay;
  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
    accessToken: deps && deps.accessToken,
  });

  const written = await writeLiveProviderInResult({
    msg,
    source: 'ebay',
    products,
    queries: msg.queries,
    exclude: msg.exclude,
    envVars,
    putObject: deps && deps.putObject,
    touchLastmod: deps && deps.touchLastmod,
    headObject: deps && deps.headObject,
    getObject: deps && deps.getObject,
    copyObject: deps && deps.copyObject,
    getObjectTagging: deps && deps.getObjectTagging,
    putObjectTagging: deps && deps.putObjectTagging,
    now: deps && deps.now,
  });

  return {
    ok: true,
    source: 'ebay',
    searchId: msg.searchId,
    env: msg.env,
    products,
    key: written.key,
    bucket: written.bucket,
  };
}

/**
 * SQS Lambda entry (FR-036). Parses Records and calls run(msg).
 * @param {{ Records?: Array<{ body: string }> }} event
 */
async function handler(event, deps) {
  const d = deps || {};
  return handleSqsWith429({
    event,
    run: d.run || run,
    deps: d,
    changeMessageVisibility: d.changeMessageVisibility,
    reportException: d.reportException,
    route: 'providers/live/ebay/handler',
    source: 'ebay',
  });
}

module.exports = {
  handler,
  run,
  EbayCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
