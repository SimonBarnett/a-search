'use strict';

/**
 * Rakuten live provider worker (FR-040).
 * Product Search XML -> normalize -> a-clubs IN/ (writeLiveProviderInResult) (injectable HTTP + putObject).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeLiveProviderInResult } = require('../../../../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../../../../shared/search/handleSqsWith429');
const {
  searchRakuten,
  assertRakutenCreds,
  RakutenCredsError,
} = require('./search');

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchRakuten?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);
  assertRakutenCreds(envVars);

  const searchFn =
    deps && typeof deps.searchRakuten === 'function'
      ? deps.searchRakuten
      : searchRakuten;
  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
  });

  const written = await writeLiveProviderInResult({
    msg,
    source: 'rakuten',
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
    source: 'rakuten',
    searchId: msg.searchId,
    env: msg.env,
    products,
    key: written.key,
    bucket: written.bucket,
  };
}

/**
 * SQS Lambda entry (FR-036).
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
    route: 'providers/live/rakuten/handler',
    source: 'rakuten',
  });
}

module.exports = {
  handler,
  run,
  RakutenCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
