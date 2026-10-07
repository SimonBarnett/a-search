'use strict';

/**
 * Impact local provider worker (FR-021 scaffold + FR-044 SqlClient SELECT).
 * Search reads MSSQL Parts (ingest is maintainer) -> normalize -> writeResults.
 *
 * @param {object} msg - SQS fan-out payload
 * @param {object} [deps]
 * @param {(msg: object) => Promise<object[]>} [deps.queryParts]
 * @param {Record<string, string|undefined>} [deps.env]
 * @param {Function} [deps.putObject]
 * @param {Function} [deps.connect] - mssql connection factory for defaultQueryParts
 * @returns {Promise<{ ok: boolean, source: string, searchId?: string, products: object[], key?: string, bucket?: string }>}
 */

const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../worker/lib/assertEnv');
const { writeResults } = require('../../../../worker/lib/writeResults');
const {
  defaultQueryParts,
  ImpactMssqlConfigError,
} = require('./queryParts');

function normalizePart(row) {
  return {
    id: row.MerchantProductId,
    title: row.Title == null ? '' : String(row.Title),
    description: row.Description == null ? undefined : String(row.Description),
    url: row.Url == null ? undefined : String(row.Url),
    imageUrl: row.ImageUrl == null ? undefined : String(row.ImageUrl),
    price: row.Price == null ? undefined : Number(row.Price),
    currency: row.Currency == null ? undefined : String(row.Currency),
    stock: row.Stock == null ? undefined : String(row.Stock),
    feedKey: row.FeedKey == null ? undefined : String(row.FeedKey),
    source: row.Source == null ? 'impact' : String(row.Source),
  };
}

async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  const queryParts =
    deps && typeof deps.queryParts === 'function'
      ? deps.queryParts
      : (m) =>
          defaultQueryParts(m, {
            env: envVars,
            connect: deps && deps.connect,
            sqlTypes: deps && deps.sqlTypes,
          });

  const rows = await queryParts(msg);
  const list = Array.isArray(rows) ? rows : [];
  const products = list.map(normalizePart);

  const written = await writeResults({
    env: msg.env,
    source: 'impact',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
  });

  return {
    ok: true,
    source: 'impact',
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
  normalizePart,
  defaultQueryParts,
  ImpactMssqlConfigError,
  EnvIsolationError,
};
