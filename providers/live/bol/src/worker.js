'use strict';

/**
 * Bol live provider worker (FR-081).
 * search -> normalize -> a-clubs IN/ (writeLiveProviderInResult) (injectable HTTP + putObject).
 * Registry enabled true (FR-171).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeLiveProviderInResult } = require('../../../../shared/search/writeLiveProviderInResult');
const { handleSqsWith429 } = require('../../../../shared/search/handleSqsWith429');
const {
  searchBol,
  assertBolCreds,
  BolCredsError,
} = require('./search');
const { normalizeSearchResponse } = require('./normalize');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchBol?: Function,
 *   normalizeSearchResponse?: Function,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  assertBolCreds(envVars);

  const doSearch =
    deps && typeof deps.searchBol === 'function'
      ? deps.searchBol
      : searchBol;

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

  const written = await writeLiveProviderInResult({
    msg,
    source: 'bol',
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
    source: 'bol',
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
async function handler(event, deps) {
  const d = deps || {};
  return handleSqsWith429({
    event,
    run: d.run || run,
    deps: d,
    changeMessageVisibility: d.changeMessageVisibility,
    reportException: d.reportException,
    route: 'providers/live/bol/handler',
    source: 'bol',
  });
}

module.exports = {
  handler,
  run,
  BolCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
