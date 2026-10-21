'use strict';

/**
 * Rakuten live provider worker (FR-040).
 * Product Search XML -> normalize -> a-clubs IN/ (writeLiveProviderInResult) (injectable HTTP + putObject).
 * FR #4768: rakuten_invalid_context -> status IN (not silent empty).
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
  isRakutenInvalidContext,
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
    // FR #4768: INVALID_CONTEXT_VALUE after sanitize still diagnosable via status IN.
    if (isRakutenInvalidContext(err)) {
      const status = {
        code: 'rakuten_invalid_context',
        httpStatus: err.statusCode != null ? err.statusCode : err.status || 400,
        message: err && err.message ? String(err.message) : String(err),
      };
      const written = await writeLiveProviderInResult({
        ...writeOpts,
        products: [],
        status,
      });
      return {
        ok: true,
        skipped: 'rakuten_invalid_context',
        source: 'rakuten',
        searchId: msg.searchId,
        env: msg.env,
        products: [],
        key: written.key,
        bucket: written.bucket,
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
