'use strict';

/**
 * CJ live provider worker (FR-041 / FR #4762).
 * GraphQL Product Search -> normalize -> a-clubs IN/ (writeLiveProviderInResult).
 * FR #4762: cj_not_authorised (non-JSON 403) -> status IN, no DLQ / intake burn.
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
  searchCj,
  assertCjCreds,
  CjCredsError,
} = require('./search');

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isCjPermanentVendorFault(err) {
  const code = err && typeof err.code === 'string' ? err.code : '';
  return code === 'cj_not_authorised';
}

/**
 * @param {object} msg
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchCj?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  if (!(deps && deps.env)) applyBundledProviderEnv(__dirname);
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);
  assertCjCreds(envVars);

  const searchFn =
    deps && typeof deps.searchCj === 'function' ? deps.searchCj : searchCj;
  const liveS3 = attachDefaultS3(deps);
  const writeOpts = {
    msg,
    source: 'cj',
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
    // FR #4762: CJ not Authorised (often non-JSON 403) is permanent for this
    // account/token class. Write status IN; do not burn DLQ.
    if (isCjPermanentVendorFault(err)) {
      const status = {
        code: err.code,
        httpStatus: err.status != null ? err.status : err.statusCode,
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
        skipped: 'cj_not_authorised',
        source: 'cj',
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
    source: 'cj',
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
    route: 'providers/live/cj/handler',
    source: 'cj',
  });
}

module.exports = {
  handler,
  run,
  CjCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
