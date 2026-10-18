'use strict';

/**
 * Rakuten live provider worker (FR-040 / FR #4040).
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
  searchRakuten,
  assertRakutenCreds,
  RakutenCredsError,
} = require('./search');

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
  const products = await runSearchWith429Backoff(
    () =>
      searchFn(msg, {
        env: envVars,
        httpRequest: deps && deps.httpRequest,
      }),
    deps,
  );

  return finishProviderSearch({
    msg,
    source: 'rakuten',
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
  RakutenCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
