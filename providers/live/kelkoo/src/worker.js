'use strict';

/**
 * Kelkoo live provider worker (FR-065 / FR #4040).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const {
  finishProviderSearch,
  runSearchWith429Backoff,
} = require('../../../../shared/search/finishProviderSearch');
const {
  searchKelkoo,
  assertKelkooCreds,
  KelkooCredsError,
} = require('./search');
const { normalizeSearchResponse } = require('./normalize');

async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);
  assertKelkooCreds(envVars);

  const doSearch =
    deps && typeof deps.searchKelkoo === 'function'
      ? deps.searchKelkoo
      : searchKelkoo;

  const raw = await runSearchWith429Backoff(
    () =>
      doSearch(msg, {
        env: envVars,
        httpRequest: deps && deps.httpRequest,
      }),
    deps,
  );

  const normalizeFn =
    deps && typeof deps.normalizeSearchResponse === 'function'
      ? deps.normalizeSearchResponse
      : normalizeSearchResponse;

  const products = normalizeFn(raw, {
    userId: msg.userId,
    env: msg.env,
    envVars,
  });

  return finishProviderSearch({
    msg,
    source: 'kelkoo',
    products,
    envVars,
    putObject: deps && deps.putObject,
    headObject: deps && deps.headObject,
    getObject: deps && deps.getObject,
    copyObject: deps && deps.copyObject,
    getObjectTagging: deps && deps.getObjectTagging,
    putObjectTagging: deps && deps.putObjectTagging,
    touchLastmod: deps && deps.touchLastmod,
  });
}

async function handler(event) {
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    const msg = typeof body === 'string' ? JSON.parse(body) : body;
    results.push(
      await run(msg, { receiptHandle: record && record.receiptHandle }),
    );
  }
  return { ok: true, results };
}

module.exports = {
  handler,
  run,
  KelkooCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
