'use strict';

/**
 * FR #4447: sql local provider worker for walrus SQL SQS drain.
 * SELECT dbo.Parts → normalize → schema-valid a-clubs IN/{searchid}-sql.json.
 * No AWS Lambda path; runs on walrus only (outbound HTTPS SQS + local MSSQL).
 */

const {
  assertWorkerEnv,
  EnvIsolationError,
} = require('../../../../shared/assertEnv');
const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const {
  buildInResult,
  inResultKey,
  validateInResult,
} = require('../../../../shared/search/inResultSchema');
const {
  defaultQueryParts,
  SqlMssqlConfigError,
} = require('./queryParts');

/**
 * @param {object} row
 * @returns {object}
 */
function normalizePart(row) {
  const raw = {};
  if (row && row.FeedKey != null) raw.feedKey = String(row.FeedKey);
  if (row && row.Stock != null) raw.stock = String(row.Stock);
  if (row && row.Source != null) raw.partSource = String(row.Source);

  const product = normalizeProduct({
    id: row && row.MerchantProductId != null ? row.MerchantProductId : '',
    title: row && row.Title != null ? row.Title : '',
    description: row && row.Description != null ? row.Description : undefined,
    url: row && row.Url != null ? String(row.Url) : undefined,
    imageUrl: row && row.ImageUrl != null ? row.ImageUrl : undefined,
    price: row && row.Price != null ? row.Price : undefined,
    currency: row && row.Currency != null ? row.Currency : undefined,
    // IN source is always sql; preserve originating Parts.Source in raw.
    source: 'sql',
    raw: Object.keys(raw).length ? raw : undefined,
  });
  assertProductSchema(product);
  return product;
}

/**
 * @param {object} msg
 * @returns {{ searchid: string, hostkey: string, guid: string }}
 */
function identityFromMsg(msg) {
  const searchid = String(
    (msg && (msg.searchid != null ? msg.searchid : msg.searchId)) || '',
  )
    .trim()
    .replace(/-sql$/i, '');
  const hostkey = String(
    (msg && (msg.hostkey || msg.host || msg.hostname || msg.userId)) || '',
  ).trim();
  const guid = String(
    (msg && (msg.guid || msg.widgetGuid || msg.catalogId)) || '',
  ).trim();
  if (!searchid) throw new Error('searchid_required');
  if (!hostkey) throw new Error('hostkey_required');
  if (!guid) throw new Error('guid_required');
  return { searchid, hostkey, guid };
}

/**
 * @param {object} msg
 * @param {object} [deps]
 * @returns {Promise<{
 *   ok: boolean,
 *   source: string,
 *   searchId: string,
 *   products: object[],
 *   key: string,
 *   bucket?: string,
 *   body: object,
 * }>}
 */
async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const envVars = (deps && deps.env) || process.env;
  assertWorkerEnv(msg, envVars.A_SEARCH_ENV);

  const { searchid, hostkey, guid } = identityFromMsg(msg);

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
  const products = list.map((row) => normalizePart(row));

  const body = buildInResult({
    searchid,
    source: 'sql',
    hostkey,
    guid,
    products,
    queries: Array.isArray(msg.queries) ? msg.queries : undefined,
    exclude: Array.isArray(msg.exclude) ? msg.exclude : undefined,
  });
  const validated = validateInResult(body);
  if (!validated.ok) {
    const err = new Error(validated.error || 'invalid_in_result');
    err.code = validated.error || 'invalid_in_result';
    throw err;
  }

  const Key = inResultKey({
    hostkey,
    guid,
    searchid,
    source: 'sql',
  });
  const Body = `${JSON.stringify(body, null, 2)}\n`;

  if (!deps || typeof deps.putObject !== 'function') {
    throw new Error('putObject_required');
  }
  await deps.putObject({
    Bucket: envVars.S3_RESULTS_BUCKET || 'a-clubs',
    Key,
    Body,
    ContentType: 'application/json; charset=utf-8',
    ContentLength: Buffer.byteLength(Body, 'utf8'),
  });

  if (typeof deps.touchLastmod === 'function') {
    await deps.touchLastmod({ Key: `${hostkey}/${guid}/` });
    await deps.touchLastmod({ Key: `${hostkey}/` });
  }

  return {
    ok: true,
    source: 'sql',
    searchId: `${searchid}-sql`,
    searchid,
    env: msg.env,
    products,
    key: Key,
    bucket: envVars.S3_RESULTS_BUCKET || 'a-clubs',
    body,
  };
}

module.exports = {
  run,
  normalizePart,
  identityFromMsg,
  defaultQueryParts,
  SqlMssqlConfigError,
  EnvIsolationError,
};
