'use strict';

/**
 * Squarespace local provider worker — reads dbo.Parts WHERE Source='squarespace'.
 */

const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const {
  defaultQueryParts,
  SquarespaceMssqlConfigError,
} = require('./queryParts');

/**
 * @param {object} msg
 * @param {object} [deps]
 */
async function handleMessage(msg, deps) {
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars);
  const queryParts =
    (deps && deps.queryParts) ||
    ((m) =>
      defaultQueryParts(m, {
        connect: deps && deps.connect,
        env: envVars,
      }));
  const rows = await queryParts(msg);
  const products = [];
  for (const row of rows || []) {
    const p = normalizeProduct({
      title: row.Title,
      url: row.Url,
      price: row.Price,
      currency: row.Currency,
      imageUrl: row.ImageUrl,
      merchantProductId: row.MerchantProductId,
      source: 'squarespace',
    });
    assertProductSchema(p);
    products.push(p);
  }
  const putObject = deps && deps.putObject;
  let key;
  let bucket;
  if (typeof putObject === 'function') {
    const written = await writeResults({
      msg,
      products,
      source: 'squarespace',
      putObject,
      env: envVars,
    });
    key = written && written.key;
    bucket = written && written.bucket;
  }
  return {
    ok: true,
    source: 'squarespace',
    searchId: msg && msg.searchId,
    products,
    key,
    bucket,
  };
}

/**
 * FR-022 worker contract: run(msg, deps) (same pattern as shopify/wix).
 * @param {object} msg - SQS fan-out payload
 * @param {object} [deps]
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  return handleMessage(msg, deps);
}

/**
 * SQS Lambda entry. Parses Records and calls run(msg).
 * @param {{ Records?: Array<{ body: string }> }} event
 * @param {object} [deps]
 */
async function handler(event, deps) {
  const records = (event && event.Records) || [];
  const results = [];
  for (const record of records) {
    const body = record && record.body;
    const msg = typeof body === 'string' ? JSON.parse(body) : body;
    results.push(await run(msg, deps));
  }
  return { ok: true, results };
}

module.exports = {
  handler,
  run,
  handleMessage,
  EnvIsolationError,
  SquarespaceMssqlConfigError,
};
