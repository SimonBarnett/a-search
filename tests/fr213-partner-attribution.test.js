'use strict';

/**
 * FR-213 / #1204: click commission attribution uses cached partnerId.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MemoryCustomersStore,
  createWidget,
  updateCustomer,
} = require('../shared/components/customers');
const {
  PARTNER_PREFIX,
  CLUB_PREFIX,
} = require('../shared/dns/hostTxtStatus');
const { resolveGo } = require('../shared/widgets/go');
const { widgetFile } = require('../shared/widgets/widgetPath');

function writeLive(root, env, customerNumber, widgetGuid, parts) {
  const key = widgetFile(env, customerNumber, widgetGuid, 'live.json');
  const abs = path.join(root, ...key.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(parts, null, 2)}\n`, 'utf8');
  return abs;
}

function countingResolver(map) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async resolveTxt(host) {
      calls += 1;
      const key = String(host || '').toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(map, key)) {
        const err = new Error('ENODATA');
        err.code = 'ENODATA';
        throw err;
      }
      return map[key];
    },
  };
}

const PART = {
  partNumber: 'P1',
  class: 'affiliate',
  source: 'amazon',
  url: 'https://www.amazon.co.uk/dp/B0001',
};

describe('FR-213 partnerId click attribution', () => {
  let root;
  let store;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr213-'));
    store = new MemoryCustomersStore();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('approved + partnerId => destination + partnerId on click record; no DNS on 2nd click', async () => {
    const w = createWidget(store, {
      host: 'agency.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [PART]);
    updateCustomer(store, 'agency.example', {
      approved: true,
      clubId: 'club-7',
      partnerId: 'partner-agency',
    });
    const dns = countingResolver({});
    const clicks = [];
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'agency.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      resolveTxt: dns.resolveTxt.bind(dns),
      recordClick: async (ev) => {
        clicks.push(ev);
      },
    });
    assert.ok(a.url);
    assert.match(a.url, /tag=tag-21/); // FR-248: amazon carries no partner param; partnerId on click record
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].partnerId, 'partner-agency');
    assert.equal(clicks[0].widgetGuid, w.widgetGuid);
    assert.equal(clicks[0].tenantId, 'club-7');
    assert.equal(dns.calls, 0, 'cached customer: no DNS on click');

    const b = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'agency.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      resolveTxt: dns.resolveTxt.bind(dns),
      recordClick: async (ev) => {
        clicks.push(ev);
      },
    });
    assert.ok(b.url);
    assert.equal(dns.calls, 0);
    assert.equal(clicks[1].partnerId, 'partner-agency');
  });

  it('approved + no partnerId => destination; partnerId null on click record', async () => {
    const w = createWidget(store, {
      host: 'selfserve.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [PART]);
    updateCustomer(store, 'selfserve.example', {
      approved: true,
      clubId: 'club-1',
      partnerId: null,
    });
    const clicks = [];
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'selfserve.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      recordClick: async (ev) => {
        clicks.push(ev);
      },
    });
    assert.ok(a.url);
    assert.doesNotMatch(a.url, /partnerId=/);
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].partnerId, null);
    assert.equal(clicks[0].tenantId, 'club-1');
  });

  it('Partner TXT alone never yields affiliate destination', async () => {
    const w = createWidget(store, {
      host: 'partneronly.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [PART]);
    const dns = countingResolver({
      'partneronly.example': [[`${PARTNER_PREFIX}agency-x`]],
    });
    const signup = 'https://signup.example/join';
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'partneronly.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      resolveTxt: dns.resolveTxt.bind(dns),
      signupUrl: signup,
    });
    assert.equal(a.signup, true);
    assert.equal(a.url, signup);
    assert.doesNotMatch(String(a.url), /amazon/);
  });
});