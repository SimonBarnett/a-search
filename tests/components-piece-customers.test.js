'use strict';

/**
 * FR-196 / #1184: Customers + Widgets in a_search (FR-251).
 * Insert-on-first-sight returns stable customerNumber; approved false by default;
 * upgradeStatus defaults to none; two widgets on one host share customerNumber.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MemoryCustomersStore,
  ensureCustomer,
  getCustomerByHost,
  createWidget,
  getWidget,
  listActiveWidgets,
} = require('../shared/components/customers');

const root = path.join(__dirname, '..');
const mig = path.join(root, 'db', 'migrations');

describe('FR-196 ComponentsPiece Customers + Widgets', () => {
  /** @type {MemoryCustomersStore} */
  let store;

  beforeEach(() => {
    store = new MemoryCustomersStore();
  });

  it('migrations exist under db/migrations for a_search (not madeiradb)', () => {
    assert.ok(fs.existsSync(path.join(mig, '001_Customers.sql')));
    assert.ok(fs.existsSync(path.join(mig, '002_Widgets.sql')));
    assert.ok(fs.existsSync(path.join(mig, 'README.md')));
    const customers = fs.readFileSync(path.join(mig, '001_Customers.sql'), 'utf8');
    const widgets = fs.readFileSync(path.join(mig, '002_Widgets.sql'), 'utf8');
    const readme = fs.readFileSync(path.join(mig, 'README.md'), 'utf8');
    assert.match(customers, /IF OBJECT_ID/i);
    assert.match(widgets, /IF OBJECT_ID/i);
    assert.match(customers, /UpgradeStatus/i);
    assert.match(customers, /Approved/i);
    assert.match(widgets, /WidgetGuid/i);
    assert.match(readme, /a_search/);
    assert.match(readme, /a_search_sandbox/);
    assert.match(readme, /madeiradb/i);
    assert.match(readme, /read-?only/i);
    assert.doesNotMatch(customers, /USE\s+madeiradb/i);
    assert.doesNotMatch(widgets, /USE\s+madeiradb/i);
  });

  it('insert-on-first-sight returns stable customerNumber; approved false', () => {
    const a = ensureCustomer(store, { host: 'shop.example' });
    const b = ensureCustomer(store, { host: 'shop.example' });
    assert.equal(a.customerNumber, b.customerNumber);
    assert.equal(a.approved, false);
    assert.equal(b.approved, false);
    assert.equal(a.upgradeStatus, 'none');
    const row = getCustomerByHost(store, 'shop.example');
    assert.ok(row);
    assert.equal(row.customerNumber, a.customerNumber);
    assert.equal(row.host, 'shop.example');
  });

  it('upgradeStatus defaults to none; two widgets same host share customerNumber', () => {
    const cust = ensureCustomer(store, { host: 'dual.example' });
    assert.equal(cust.upgradeStatus, 'none');
    const w1 = createWidget(store, {
      host: 'dual.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    const w2 = createWidget(store, {
      host: 'dual.example',
      layout: 'vertical',
      createdVia: 'smartcatalogue',
    });
    assert.notEqual(w1.widgetGuid, w2.widgetGuid);
    assert.equal(w1.customerNumber, cust.customerNumber);
    assert.equal(w2.customerNumber, cust.customerNumber);
    assert.equal(w1.host, 'dual.example');
    assert.equal(w2.status, 'active');
    const fetched = getWidget(store, w1.widgetGuid);
    assert.ok(fetched);
    assert.equal(fetched.widgetGuid, w1.widgetGuid);
    const list = listActiveWidgets(store, cust.customerNumber);
    assert.equal(list.length, 2);
    assert.ok(list.every((w) => w.customerNumber === cust.customerNumber));
  });
});
