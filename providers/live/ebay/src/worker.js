'use strict';

/**
 * eBay live provider worker (FR-039).
 * Browse API search -> normalize -> writeResults (injectable HTTP + putObject).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../worker/lib/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
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
  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
    accessToken: deps && deps.accessToken,
  });

  const written = await writeResults({
    env: msg.env,
    source: 'ebay',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
  });

  return {
    ok: true,
    source: 'ebay',
    searchId: msg.searchId,
    env: msg.env,
    products,
    key: written.key,
    bucket: written.bucket,
  };
}

/**
 * SQS Lambda entry (FR-036). Parses Records and calls run(msg).
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
  EbayCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
