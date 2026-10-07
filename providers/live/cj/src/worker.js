'use strict';

/**
 * CJ live provider worker (FR-041).
 * GraphQL Product Search â†’ normalize â†’ writeResults (injectable HTTP + putObject).
 */

const path = require('node:path');
const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../worker/lib/writeResults');
const {
  searchCj,
  assertCjCreds,
  CjCredsError,
} = require('./search');

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
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);
  assertCjCreds(envVars);

  const searchFn =
    deps && typeof deps.searchCj === 'function' ? deps.searchCj : searchCj;
  const products = await searchFn(msg, {
    env: envVars,
    httpRequest: deps && deps.httpRequest,
  });

  const written = await writeResults({
    env: msg.env,
    source: 'cj',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
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
  CjCredsError,
  EnvIsolationError,
  _fixtureDir: path.join(__dirname, '..', 'fixtures'),
};
