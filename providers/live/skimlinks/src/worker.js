'use strict';

/**
 * Skimlinks live provider worker (FR-069 / FR-168).
 * search → normalize → writeResults (injectable HTTP + putObject).
 * Registry enabled true (FR-168).
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
  searchSkimlinks,
  assertSkimlinksCreds,
  SkimlinksCredsError,
} = require('./search');
const { normalizeSearchResponse } = require('./normalize');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchSkimlinks?: Function,
 *   normalizeSearchResponse?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  if (!(deps && deps.env)) applyBundledProviderEnv(__dirname);
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  assertSkimlinksCreds(envVars);

  const doSearch =
    deps && typeof deps.searchSkimlinks === 'function'
      ? deps.searchSkimlinks
      : searchSkimlinks;

  const raw = await doSearch(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
  });

  const normalizeFn =
    deps && typeof deps.normalizeSearchResponse === 'function'
      ? deps.normalizeSearchResponse
      : normalizeSearchResponse;

  const products = normalizeFn(raw, {
    userId: msg.userId,
    env: msg.env,
    envVars,
  });

  const liveS3 = attachDefaultS3(deps);
  const written = await writeLiveProviderInResult({
    msg,
    source: 'skimlinks',
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
    source: 'skimlinks',
    searchId: msg.searchId,
    env: msg.env,
    products,
    key: written.key,
    bucket: written.bucket,
  };
}

/**
 * SQS Lambda entry. Parses Records and calls run(msg).
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
    route: 'providers/live/skimlinks/handler',
    source: 'skimlinks',
  });
}

module.exports = {
  handler,
  run,
  SkimlinksCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
