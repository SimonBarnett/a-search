'use strict';

/**
 * Rakuten live provider worker (FR-040 / FR #4768 / FR #4769).
 * Product Search XML -> normalize -> a-clubs IN/ (writeLiveProviderInResult).
 * FR #4768: per-query fan-out, hyphen sanitize, none stopwords (in search.js).
 * FR #4769: API failures (incl. rakuten_invalid_context) throw into DLQ; no status IN.
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

  const liveS3 = attachDefaultS3(deps);
  const writeOpts = {
    msg,
    source: 'rakuten',
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

  // FR #4769: search throws on rakuten_invalid_context (and other API faults);
  // handleSqsWith429 logs and fails into the DLQ --- no status IN here.
  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
  });

  const written = await writeLiveProviderInResult({
    ...writeOpts,
    products,
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
