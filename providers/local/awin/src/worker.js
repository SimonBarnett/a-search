'use strict';

/**
 * Awin local provider worker stub (FR-020 scaffold).
 * Search reads MSSQL Parts (ingest is maintainer). Default queryParts is a
 * no-op empty result until a real SqlClient lands; tests inject a mock.
 *
 * @param {object} msg - SQS fan-out payload
 * @param {object} [deps]
 * @param {(msg: object) => Promise<object[]>} [deps.queryParts]
 * @returns {Promise<{ ok: boolean, source: string, searchId?: string, products: object[] }>}
 */
async function defaultQueryParts(_msg) {
  // Real SELECT against dbo.Parts lands in a later FR; scaffold returns [].
  return [];
}

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
    source: row.Source == null ? 'awin' : String(row.Source),
  };
}

async function run(msg, deps) {
  if (!msg || typeof msg !== 'object') {
    throw new Error('run(msg) requires a message object');
  }
  const queryParts =
    deps && typeof deps.queryParts === 'function'
      ? deps.queryParts
      : defaultQueryParts;
  const rows = await queryParts(msg);
  const list = Array.isArray(rows) ? rows : [];
  const products = list.map(normalizePart);
  return {
    ok: true,
    source: 'awin',
    searchId: msg.searchId,
    env: msg.env,
    products,
    message:
      'awin local worker stub â€” SELECT dbo.Parts via injectable queryParts; ingest is maintainer',
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
  handler, run, normalizePart, defaultQueryParts };
