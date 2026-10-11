'use strict';

/**
 * Bol live provider worker (FR-081).
 * search -> normalize -> writeResults (injectable HTTP + putObject).
 * Registry enabled true (FR-171).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
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

  const written = await writeResults({
    env: msg.env,
    source: 'bol',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
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
async function handler(event) {
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    const msg = typeof body === 'string' ? JSON.parse(body) : body;
    results.push(await run(msg));
  }
  return { ok: true, results };
}

module.exports = {
  handler,
  run,
  BolCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
