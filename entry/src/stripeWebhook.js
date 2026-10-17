'use strict';

/**
 * FR-239: POST /webhooks/stripe — shared Stripe webhook.
 * Routes merchant_shop to shops transitions; widget_upgrade ignored for Shops.
 * Signature verified when stripeWebhookSecret + verifyStripeSignature provided.
 */

const crypto = require('node:crypto');
const {
  createShopsRegistry,
} = require('../../shared/shops/registry');
const {
  createStripeEventStore,
  createSqlStripeEventStore,
  assertStripeEventsDatabase,
} = require('../../shared/shops/stripeEvents');
const {
  createShopInvoicesStore,
} = require('../../shared/shops/shopInvoices');
const {
  applyMerchantShopStripeEvent,
  ASE_PRODUCT_WIDGET,
} = require('../../shared/shops/subscribe');
const {
  createPartFeedKeysStore,
  createShopSyncQueue,
  createPartsStore,
} = require('../../shared/shops/shopSync');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const defaultShops = createShopsRegistry();
const defaultEvents = createStripeEventStore();
const defaultInvoices = createShopInvoicesStore();
const defaultFeedKeys = createPartFeedKeysStore();
const defaultQueue = createShopSyncQueue();
const defaultParts = createPartsStore();

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function headerGet(headers, name) {
  if (!headers || typeof headers !== 'object') return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === want) return v;
  }
  return undefined;
}

/**
 * Minimal Stripe-compatible HMAC check (testable).
 * @param {string|Buffer} rawBody
 * @param {string} sigHeader
 * @param {string} secret
 * @param {number} [nowMs]
 */
function verifyStripeSignature(rawBody, sigHeader, secret, nowMs) {
  if (!sigHeader || !secret) return false;
  const parts = String(sigHeader).split(',').map((p) => p.trim());
  /** @type {Record<string, string>} */
  const map = {};
  for (const p of parts) {
    const i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i)] = p.slice(i + 1);
  }
  const ts = map.t;
  const v1 = map.v1;
  if (!ts || !v1) return false;
  const age = Math.abs(
    (nowMs != null ? Number(nowMs) : Date.now()) / 1000 - Number(ts),
  );
  if (age > 300) return false;
  const payload = `${ts}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
  const expect = crypto
    .createHmac('sha256', String(secret))
    .update(payload)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expect, 'utf8'),
      Buffer.from(String(v1), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchStripeWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/webhooks/stripe') {
    return 'POST /webhooks/stripe';
  }
  return null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
/**
 * Pick the StripeEvents store. Injected stores win (unit pins).
 * When MSSQL_DATABASE is a_search or a_search_sandbox, use the SQL writer.
 * a_search also purges rows older than 30 days. Any other database name
 * fails closed (FR-251: never madeiradb).
 * @param {object} deps
 */
function resolveStripeEvents(deps) {
  if (deps && deps.stripeEvents) return deps.stripeEvents;
  const env = (deps && deps.env) || process.env;
  const database = String((env && env.MSSQL_DATABASE) || '').trim();
  if (!database) return defaultEvents;
  const name = assertStripeEventsDatabase(database);
  const query =
    deps && typeof deps.sqlQuery === 'function'
      ? deps.sqlQuery
      : (statement) => defaultSqlStripeEventsQuery(env, statement);
  return createSqlStripeEventStore({ query, database: name });
}

/**
 * Lazy mssql writer. Tests inject sqlQuery and never reach this.
 * @param {Record<string, string|undefined>} env
 * @param {{ sql: string, inputs: object }} statement
 */
async function defaultSqlStripeEventsQuery(env, statement) {
  // eslint-disable-next-line global-require
  const sql = require('mssql');
  const pool = await sql.connect({
    server: String(env.MSSQL_SERVER || '').trim(),
    database: String(env.MSSQL_DATABASE || '').trim(),
    user: String(env.MSSQL_USER || '').trim(),
    password: env.MSSQL_PASSWORD == null ? '' : String(env.MSSQL_PASSWORD),
    options: {
      encrypt: String(env.MSSQL_ENCRYPT || 'true').toLowerCase() !== 'false',
      trustServerCertificate:
        String(env.MSSQL_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() !==
        'false',
    },
  });
  try {
    const request = pool.request();
    const inputs = (statement && statement.inputs) || {};
    for (const [key, value] of Object.entries(inputs)) {
      if (value instanceof Date) request.input(key, sql.DateTime2, value);
      else if (typeof value === 'number') request.input(key, sql.Int, value);
      else request.input(key, sql.NVarChar, value);
    }
    return request.query(statement.sql);
  } finally {
    if (typeof pool.close === 'function') {
      await Promise.resolve(pool.close()).catch(() => {});
    }
  }
}

async function handleStripeWebhook(event, deps = {}) {
  const rawBody =
    event && event.isBase64Encoded
      ? Buffer.from(String(event.body || ''), 'base64').toString('utf8')
      : event && event.body != null
        ? typeof event.body === 'string'
          ? event.body
          : JSON.stringify(event.body)
        : '';

  const secret = String(
    deps.stripeWebhookSecret ||
      (deps.env && deps.env.STRIPE_WEBHOOK_SECRET) ||
      process.env.STRIPE_WEBHOOK_SECRET ||
      '',
  ).trim();
  const sig = headerGet(event && event.headers, 'stripe-signature');
  const verify =
    typeof deps.verifyStripeSignature === 'function'
      ? deps.verifyStripeSignature
      : verifyStripeSignature;

  // Fail closed: a missing secret must not accept unsigned events (FR-239).
  if (!secret) {
    return jsonResponse(400, { ok: false, error: 'webhook_secret_missing' });
  }
  const ok = verify(rawBody, sig, secret, deps.nowMs);
  if (!ok) {
    return jsonResponse(400, { ok: false, error: 'invalid_signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody || '{}');
  } catch {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }

  const result = await applyMerchantShopStripeEvent({
    event: payload,
    shops: deps.shops || defaultShops,
    events: resolveStripeEvents(deps),
    invoices: deps.shopInvoices || defaultInvoices,
    feedKeys: deps.feedKeys || defaultFeedKeys,
    queue: deps.shopSyncQueue || defaultQueue,
    parts: deps.parts || defaultParts,
    vault: deps.vault,
    nowMs: deps.nowMs,
    log: deps.log,
  });

  // Explicit pin: widget_upgrade path returns ignored
  void ASE_PRODUCT_WIDGET;

  return jsonResponse(200, { ok: true, ...result });
}

module.exports = {
  matchStripeWebhookRoute,
  handleStripeWebhook,
  verifyStripeSignature,
  resolveStripeEvents,
};
