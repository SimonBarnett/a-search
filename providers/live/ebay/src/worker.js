'use strict';

/**
 * eBay live provider worker (FR-039 / FR #4040).
 * Browse API search -> normalize -> a-clubs IN/ (agent jobs) or writeResults.
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
  searchEbay,
  assertEbayCreds,
  EbayCredsError,
} = require('./search');

/**
 * @param {object} msg - SQS fan-out payload
 * @param {{
 *   env?: Record<string, string|undefined>,
 *   httpRequest?: Function,
 *   putObject?: Function,
 *   searchEbay?: Function,
 *   accessToken?: string,
 *   changeMessageVisibility?: Function,
 *   receiptHandle?: string,
 * }} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  assertEbayCreds(envVars);

  const searchFn =
    deps && typeof deps.searchEbay === 'function'
      ? deps.searchEbay
      : searchEbay;
  const products = await runSearchWith429Backoff(
    () =>
      searchFn(msg, {
        env: envVars,
        httpRequest: deps && deps.httpRequest,
        accessToken: deps && deps.accessToken,
      }),
    deps,
  );

  return finishProviderSearch({
    msg,
    source: 'ebay',
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

/**
 * SQS Lambda entry (FR-036). Parses Records and calls run(msg).
 * @param {{ Records?: Array<{ body: string, receiptHandle?: string }> }} event
 */
async function handler(event) {
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    const msg = typeof body === 'string' ? JSON.parse(body) : body;
    results.push(
      await run(msg, {
        receiptHandle: record && record.receiptHandle,
      }),
    );
  }
  return { ok: true, results };
}

module.exports = {
  handler,
  run,
  EbayCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
