'use strict';

/**
 * WooCommerce local provider worker (FR-607 stub + FR-111 SqlClient SELECT).
 * Search reads MSSQL Parts (ingest is maintainer / FR-109..106) -> normalize -> writeResults.
 * Stay-dark: registry enabled stays false.
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
} = require('../../../../shared/assertEnv');
const { writeResults } = require('../../../../shared/writeResults');
const {
  normalizeProduct,
  assertProductSchema,
} = require('../../../../worker/lib/normalizeProduct');
const {
  buildTrackedUrl,
  TrackedUrlError,
} = require('../../../../shared/links/buildTrackedUrl');
const {
  defaultQueryParts,
  WooCommerceMssqlConfigError,
} = require('./queryParts');

/**
 * Resolve Parts Url to absolute http(s) using WOOCOMMERCE_STORE_URL when relative.
 * @param {unknown} rawUrl
 * @param {Record<string, string|undefined>} envVars
 * @returns {string|undefined}
 */
function resolveWooCommerceProductUrl(rawUrl, envVars) {
  if (rawUrl == null || String(rawUrl).trim() === '') return undefined;
  const s = String(rawUrl).trim();
  try {
    const abs = new URL(s);
    if (abs.protocol === 'http:' || abs.protocol === 'https:') return abs.toString();
  } catch {
    // relative path ¼Ø join store base
  }
  const store = String((envVars && envVars.WOOCOMMERCE_STORE_URL) || '').trim();
  if (!store) {
    throw new TrackedUrlError(
      'woocommerce relative Url requires WOOCOMMERCE_STORE_URL',
      'tracked_url_missing_account',
    );
  }
  const base = store.endsWith('/') ? store : `${store}/`;
  const path = s.startsWith('/') ? s.slice(1) : s;
  return new URL(path, base).toString();
}

/**
 * @param {object} row - Parts row
 * @param {{
 *   userId: string,
 *   env?: string,
 *   envVars: Record<string, string|undefined>,
 * }} [track] - required when row.Url is present
 */
function normalizePart(row, track) {
  const raw = {};
  if (row && row.FeedKey != null) raw.feedKey = String(row.FeedKey);
  if (row && row.Stock != null) raw.stock = String(row.Stock);

  let url;
  if (row && row.Url != null && String(row.Url).trim() !== '') {
    if (!track || typeof track !== 'object') {
      throw new TrackedUrlError(
        'WooCommerce normalizePart requires track context { userId, envVars } for Url',
        'tracked_url_missing_userId',
      );
    }
    const absolute = resolveWooCommerceProductUrl(row.Url, track.envVars || {});
    url = buildTrackedUrl({
      url: absolute,
      userId: track.userId,
      env: track.env,
      envVars: track.envVars || {},
      requiredAccountKeys: ['WOOCOMMERCE_AFFILIATE_ID'],
      accountQueryMap: { WOOCOMMERCE_AFFILIATE_ID: 'sid' },
    });
  }

  const product = normalizeProduct({
    id: row && row.MerchantProductId != null ? row.MerchantProductId : '',
    title: row && row.Title != null ? row.Title : '',
    description: row && row.Description != null ? row.Description : undefined,
    url,
    imageUrl: row && row.ImageUrl != null ? row.ImageUrl : undefined,
    price: row && row.Price != null ? row.Price : undefined,
    currency: row && row.Currency != null ? row.Currency : undefined,
    source: row && row.Source != null ? row.Source : 'woocommerce',
    raw: Object.keys(raw).length ? raw : undefined,
  });
  assertProductSchema(product);
  return product;
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
  const track = {
    userId: msg.userId,
    env: msg.env,
    envVars,
  };
  const products = list.map((row) => normalizePart(row, track));

  const written = await writeResults({
    env: msg.env,
    source: 'woocommerce',
    userId: msg.userId,
    catalogId: msg.catalogId,
    searchId: msg.searchId,
    products,
    envVars,
    putObject: deps && deps.putObject,
  });

  return {
    ok: true,
    source: 'woocommerce',
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
  resolveWooCommerceProductUrl,
  defaultQueryParts,
  WooCommerceMssqlConfigError,
  EnvIsolationError,
  TrackedUrlError,
};
