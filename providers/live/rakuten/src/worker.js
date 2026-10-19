'use strict';

/**
 * Rakuten live provider worker (FR-040).
 * Product Search XML -> normalize -> a-clubs IN/ (writeLiveProviderInResult) (injectable HTTP + putObject).
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
  reportException: defaultReportException,
} = require('../../../../shared/intake/reportException');
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
  if (!(deps && deps.env)) applyBundledProviderEnv(__dirname);
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

  const liveS3 = attachDefaultS3(deps);
  const written = await writeLiveProviderInResult({
    msg,
    source: 'rakuten',
    products,
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
async function handler(event, arg) {
  const d = attachDefaultS3(arg);
  return handleSqsWith429({
    event,
    run: d.run || run,
    deps: d,
    changeMessageVisibility: d.changeMessageVisibility,
    reportException: d.reportException || defaultReportException,
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
