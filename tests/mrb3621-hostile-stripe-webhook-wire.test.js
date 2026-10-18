'use strict';

/**
 * Hostile pin: MRB a-search#3621 — POST /webhooks/stripe must apply widget_upgrade
 * (not FR-208 501 stub).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { handler } = require('../entry/src/index');
const {
  MemoryCustomersStore,
  ensureCustomer,
  createWidget,
  setDefaultCustomersStore,
} = require('../shared/components/customers');

describe('mrb3621 hostile: stripe widget_upgrade webhook wire', () => {
  it('index.js requires stripeWidgetUpgradeWebhook and prefers it over cp stub', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'entry', 'src', 'index.js'),
      'utf8',
    );
    assert.match(text, /stripeWidgetUpgradeWebhook/);
    assert.match(text, /handleStripeWidgetUpgradeWebhook/);
    const stripeIdx = text.indexOf('if (stripeWebhookRoute)');
    const cpIdx = text.indexOf('if (cpRoute)');
    assert.ok(stripeIdx > 0 && cpIdx > stripeIdx, 'stripe handler before cp stub');
  });

  it('POST /webhooks/stripe applies widget_upgrade and skips merchant_shop', async () => {
    const store = new MemoryCustomersStore();
    ensureCustomer(store, { host: 'wire.example' });
    const cust = store.getCustomerByHost('wire.example');
    store.byNumber.delete(cust.customerNumber);
    cust.customerNumber = '4242';
    store.byNumber.set('4242', cust);
    store.byHost.set('wire.example', cust);
    createWidget(store, {
      host: 'wire.example',
      layout: 'fullscreen',
      createdVia: 'extension',
    });
    setDefaultCustomersStore(store);
    const queued = [];
    const upgradeEvent = {
      requestContext: { http: { method: 'POST', path: '/webhooks/stripe' } },
      body: JSON.stringify({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_wire_1',
            object: 'subscription',
            status: 'active',
            metadata: {
              aSearchProduct: 'widget_upgrade',
              customerNumber: '4242',
            },
          },
        },
      }),
    };
    const up = await handler(upgradeEvent, {}, {
      customersStore: store,
      enqueueTierChanged: (m) => queued.push(m),
    });
    assert.equal(up.statusCode, 200);
    const upBody = JSON.parse(up.body);
    assert.equal(upBody.ok, true);
    assert.equal(upBody.upgradeStatus, 'active');
    assert.equal(store.getCustomerByHost('wire.example').upgradeStatus, 'active');
    assert.equal(queued.length, 1);

    const shopEvent = {
      requestContext: { http: { method: 'POST', path: '/webhooks/stripe' } },
      body: JSON.stringify({
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_shop_wire',
            object: 'subscription',
            status: 'active',
            metadata: {
              aSearchProduct: 'merchant_shop',
              customerNumber: '4242',
            },
          },
        },
      }),
    };
    const skip = await handler(shopEvent, {}, { customersStore: store });
    assert.equal(skip.statusCode, 400);
    assert.equal(JSON.parse(skip.body).error, 'webhook_secret_missing');
    assert.equal(store.getCustomerByHost('wire.example').upgradeStatus, 'active');
    setDefaultCustomersStore(null);
  });
});
