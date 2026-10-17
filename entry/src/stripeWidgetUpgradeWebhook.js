'use strict';

/**
 * #1345: POST /webhooks/stripe -> widget_upgrade Customers.upgradeStatus + tier_changed.
 * Signature verify is injectable (FR-208 sibling); merchant_shop is skipped by the helper.
 */

const {
  applyWidgetUpgradeStripeEvent,
} = require('../../shared/account/widgetUpgradeStripe');
const {
  getDefaultCustomersStore,
} = require('../../shared/components/customers');

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

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

function parseBody(raw, isBase64Encoded) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object') return raw;
  let text = String(raw);
  if (isBase64Encoded) {
    text = Buffer.from(text, 'base64').toString('utf8');
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * @param {string} method
 * @param {string} path
 */
function matchStripeWebhookRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  if (m === 'POST' && p === '/webhooks/stripe') return 'POST /webhooks/stripe';
  return null;
}

/**
 * Pull a subscription-like object from a Stripe event envelope.
 * @param {object} eventBody
 * @returns {object|null}
 */
function subscriptionFromStripeEvent(eventBody) {
  if (!eventBody || typeof eventBody !== 'object') return null;
  const obj = eventBody.data && eventBody.data.object;
  if (!obj || typeof obj !== 'object') return null;
  const type = String(eventBody.type || '');
  if (type.startsWith('customer.subscription.')) return obj;
  if (type === 'invoice.payment_failed' && obj.subscription) {
    return {
      id: obj.subscription,
      status: 'unpaid',
      metadata: obj.metadata || {},
      items: obj.lines || undefined,
    };
  }
  return obj.object === 'subscription' ? obj : null;
}

/**
 * @param {object} event
 * @param {object} [deps]
 */
async function handleStripeWidgetUpgradeWebhook(event, deps = {}) {
  const env = deps.env || process.env;
  const verify =
    typeof deps.verifyStripeSignature === 'function'
      ? deps.verifyStripeSignature
      : null;
  const secret = String(
    (env && env.STRIPE_WEBHOOK_SECRET) || process.env.STRIPE_WEBHOOK_SECRET || '',
  ).trim();
  if (verify) {
    const ok = await verify(event, { env, secret });
    if (!ok) {
      return jsonResponse(401, { ok: false, error: 'invalid_signature' });
    }
  } else if (secret) {
    // Secret configured but no verifier injected: refuse rather than accept unsigned.
    return jsonResponse(401, { ok: false, error: 'signature_required' });
  }

  const body = parseBody(event && event.body, event && event.isBase64Encoded);
  if (body == null) {
    return jsonResponse(400, { ok: false, error: 'invalid_json' });
  }
  const stripeObject = subscriptionFromStripeEvent(body);
  if (!stripeObject) {
    return jsonResponse(200, { ok: true, skipped: 'not_subscription_event' });
  }

  const store = deps.customersStore || getDefaultCustomersStore();
  const enqueue =
    typeof deps.enqueueTierChanged === 'function'
      ? deps.enqueueTierChanged
      : null;
  try {
    const result = applyWidgetUpgradeStripeEvent({
      store,
      stripeObject,
      at: deps.at,
      enqueueTierChanged: enqueue,
    });
    return jsonResponse(200, result);
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'apply_failed';
    if (code === 'customer_not_found' || code === 'customerNumber_required') {
      return jsonResponse(400, { ok: false, error: code });
    }
    throw err;
  }
}

module.exports = {
  matchStripeWebhookRoute,
  handleStripeWidgetUpgradeWebhook,
  subscriptionFromStripeEvent,
};
