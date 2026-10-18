'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { bootstrapWidget } = require('../shared/widgets/bootstrap');
const {
  runIngestPass,
  LIVE_PART_CAP_FREE,
  LIVE_PART_CAP_FULL,
} = require('../shared/widgets/agentIngest');
const { isFullTier } = require('../shared/widgets/agentWidgetContext');
const {
  MemoryCustomersStore,
  ensureCustomer,
  createWidget,
} = require('../shared/components/customers');
const {
  mapStripeSubscriptionToUpgradeStatus,
  applyWidgetUpgradeStripeEvent,
  isUpgradedStatus,
} = require('../shared/account/widgetUpgradeStripe');

const env = 'sandbox';
const host = 'cap.example';
const customerNumber = '9001';
const widgetGuid = '11111111-1111-4111-8111-111111111111';

describe('FR-1345 live.json / searches caps + widget_upgrade Stripe', () => {
  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1345-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function widgetDir() {
    return path.join(root, env, 'x', customerNumber, widgetGuid);
  }

  function writeIn(parts) {
    fs.writeFileSync(
      path.join(widgetDir(), 'in.json'),
      `${JSON.stringify(parts, null, 2)}\n`,
      'utf8',
    );
  }

  it('pins LIVE_PART_CAP constants and fullTier rule', () => {
    assert.equal(LIVE_PART_CAP_FREE, 10);
    assert.equal(LIVE_PART_CAP_FULL, 500);
    assert.equal(isFullTier({ upgraded: true, layout: 'horizontal' }), false);
    assert.equal(isFullTier({ upgraded: true, layout: 'fullscreen' }), true);
  });

  it('upgraded + horizontal stays free cap 10 (not fullTier)', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    const incoming = [];
    for (let i = 0; i < 25; i++) {
      incoming.push({ id: 'H' + i, title: 'H' + i, price: i, score: 50 - i });
    }
    writeIn(incoming);
    const r = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: true,
      layout: 'horizontal',
    });
    assert.equal(r.fullTier, false);
    assert.equal(r.liveCap, 10);
    assert.equal(r.liveLength, 10);
  });

  it('mapStripeSubscriptionToUpgradeStatus Decision LOCKED', () => {
    assert.equal(mapStripeSubscriptionToUpgradeStatus('active'), 'active');
    assert.equal(mapStripeSubscriptionToUpgradeStatus('trialing'), 'active');
    assert.equal(mapStripeSubscriptionToUpgradeStatus('past_due'), 'lapsed');
    assert.equal(mapStripeSubscriptionToUpgradeStatus('canceled'), 'lapsed');
    assert.equal(mapStripeSubscriptionToUpgradeStatus('unpaid'), 'lapsed');
    assert.equal(isUpgradedStatus('active'), true);
    assert.equal(isUpgradedStatus('lapsed'), false);
  });

  it('widget_upgrade Stripe event patches Customers and enqueues tier_changed per widget', () => {
    const store = new MemoryCustomersStore();
    ensureCustomer(store, { host });
    const cust = store.getCustomerByHost(host);
    // bind customerNumber for metadata match
    store.byNumber.delete(cust.customerNumber);
    cust.customerNumber = customerNumber;
    store.byNumber.set(customerNumber, cust);
    store.byHost.set(host, cust);
    createWidget(store, {
      host,
      layout: 'horizontal',
      createdVia: 'extension',
    });
    createWidget(store, {
      host,
      layout: 'fullscreen',
      createdVia: 'extension',
    });
    const queued = [];
    const result = applyWidgetUpgradeStripeEvent({
      store,
      stripeObject: {
        id: 'sub_upgrade_1',
        status: 'active',
        metadata: {
          aSearchProduct: 'widget_upgrade',
          customerNumber,
        },
      },
      at: '2026-10-17T00:00:00.000Z',
      enqueueTierChanged: (m) => queued.push(m),
    });
    assert.equal(result.ok, true);
    assert.equal(result.upgradeStatus, 'active');
    assert.equal(result.tierChangedCount, 2);
    assert.equal(queued.length, 2);
    assert.ok(queued.every((m) => m.eventType === 'tier_changed'));
    const after = store.getCustomerByHost(host);
    assert.equal(after.upgradeStatus, 'active');
    assert.equal(after.upgradeSubscriptionId, 'sub_upgrade_1');
  });

  it('merchant_shop Stripe events skip upgradeStatus', () => {
    const store = new MemoryCustomersStore();
    ensureCustomer(store, { host });
    const r = applyWidgetUpgradeStripeEvent({
      store,
      stripeObject: {
        id: 'sub_shop_1',
        status: 'active',
        metadata: {
          aSearchProduct: 'merchant_shop',
          customerNumber: '1',
        },
      },
    });
    assert.equal(r.skipped, 'not_widget_upgrade');
    assert.equal(store.getCustomerByHost(host).upgradeStatus, 'none');
  });

  it('Parts API / entry sources never reference LIVE_PART_CAP or SEARCH_QUERY_CAP', () => {
    const entryRoot = path.join(__dirname, '..', 'entry', 'src');
    const files = [];
    function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) walk(p);
        else if (name.endsWith('.js')) files.push(p);
      }
    }
    walk(entryRoot);
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(
        text,
        /LIVE_PART_CAP_|SEARCH_QUERY_CAP_/,
        'fail-when: Parts API/entry references tier caps: ' + f,
      );
    }
  });

  it('docs/fr/FR-1345.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-1345.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-1345.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /LIVE_PART_CAP_FREE/);
    assert.match(text, /widget_upgrade/);
    assert.match(text, /tier_changed/);
    assert.match(text, /fullscreen/);
  });
});
