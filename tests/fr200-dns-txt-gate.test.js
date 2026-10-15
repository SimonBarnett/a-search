'use strict';

/**
 * FR-200 / #1188: dual DNS TXT gate + approval cache + /ext/status share.
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
  getCustomerByHost,
} = require('../shared/components/customers');
const {
  hostTxtStatus,
  extStatus,
  parseTxtRecords,
  CLUB_PREFIX,
  PARTNER_PREFIX,
} = require('../shared/dns/hostTxtStatus');
const { resolveGo } = require('../shared/widgets/go');
const { widgetFile } = require('../shared/widgets/widgetPath');
const { handleGo } = require('../entry/src/go');
const { handleExtStatus } = require('../entry/src/extStatus');
const { handler } = require('../entry/src/index');

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

describe('FR-200 DNS TXT gate', () => {
  /** @type {string} */
  let root;
  /** @type {MemoryCustomersStore} */
  let store;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr200-'));
    store = new MemoryCustomersStore();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('parseTxtRecords reads club and partner prefixes', () => {
    const parsed = parseTxtRecords([
      [`${CLUB_PREFIX}club-1`],
      [`${PARTNER_PREFIX}partner-9`],
    ]);
    assert.equal(parsed.clubId, 'club-1');
    assert.equal(parsed.partnerId, 'partner-9');
  });

  it('go: Partner TXT alone => signup only; DNS then cached', async () => {
    const w = createWidget(store, {
      host: 'shop.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'affiliate',
        source: 'amazon',
        url: 'https://www.amazon.co.uk/dp/B0001',
      },
    ]);
    const dns = countingResolver({
      'shop.example': [[`${PARTNER_PREFIX}agency-1`]],
    });
    const signup = 'https://signup.example/join';
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      signupUrl: signup,
      resolveTxt: dns.resolveTxt.bind(dns),
    });
    assert.equal(a.signup, true);
    assert.equal(a.url, signup);
    assert.equal(a.clickId, null);
    assert.equal(dns.calls, 1);
    const cust = getCustomerByHost(store, 'shop.example');
    assert.equal(cust.approved, false);
    assert.equal(cust.clubId, null);

    const b = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      signupUrl: signup,
      resolveTxt: dns.resolveTxt.bind(dns),
    });
    assert.equal(b.signup, true);
    assert.equal(dns.calls, 1, 'negative cache must skip second DNS');
  });

  it('go: Club TXT only => approve + destination; partnerId null; second click DNS=1', async () => {
    const w = createWidget(store, {
      host: 'clubonly.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'affiliate',
        source: 'amazon',
        url: 'https://www.amazon.co.uk/dp/B0001',
      },
    ]);
    const dns = countingResolver({
      'clubonly.example': [[`${CLUB_PREFIX}club-42`]],
    });
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'clubonly.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      signupUrl: 'https://signup.example/join',
      resolveTxt: dns.resolveTxt.bind(dns),
    });
    assert.equal(a.signup, false);
    assert.match(a.url, /tag=tag-21/); // FR-248: amazon non-upgraded club -> base tag; tenant on click record
    assert.ok(a.clickId);
    assert.equal(dns.calls, 1);
    const cust = getCustomerByHost(store, 'clubonly.example');
    assert.equal(cust.approved, true);
    assert.equal(cust.clubId, 'club-42');
    assert.equal(cust.partnerId, null);

    const b = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'clubonly.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      signupUrl: 'https://signup.example/join',
      resolveTxt: dns.resolveTxt.bind(dns),
    });
    assert.equal(b.signup, false);
    assert.equal(dns.calls, 1, 'approved cache must not re-query DNS');
  });

  it('go: Club + Partner TXT => destination + partnerId', async () => {
    const w = createWidget(store, {
      host: 'both.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'affiliate',
        source: 'amazon',
        url: 'https://www.amazon.co.uk/dp/B0001',
      },
    ]);
    const dns = countingResolver({
      'both.example': [
        [`${CLUB_PREFIX}club-7`],
        [`${PARTNER_PREFIX}partner-3`],
      ],
    });
    const a = await resolveGo({
      envMap: { AMAZON_PARTNER_TAG: 'tag-21' }, // FR-248 fail-closed: base amazon tag
      root,
      env: 'sandbox',
      host: 'both.example',
      widgetGuid: w.widgetGuid,
      part: 'P1',
      store,
      signupUrl: 'https://signup.example/join',
      resolveTxt: dns.resolveTxt.bind(dns),
    });
    assert.equal(a.signup, false);
    assert.match(a.url, /tag=tag-21/); // FR-248: amazon carries no partner param; partnerId on click record
    const cust = getCustomerByHost(store, 'both.example');
    assert.equal(cust.partnerId, 'partner-3');
  });

  it('/ext/status then /go shares one DNS query; Partner alone => enabled false', async () => {
    const w = createWidget(store, {
      host: 'ext.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'merchant',
        url: 'https://ext.example/p/1',
      },
    ]);
    const dns = countingResolver({
      'ext.example': [[`${CLUB_PREFIX}club-ext`]],
    });

    const st = await handleExtStatus(
      {
        requestContext: { http: { method: 'GET', path: '/ext/status' } },
        rawPath: '/ext/status',
        queryStringParameters: { host: 'ext.example' },
      },
      { store, resolveTxt: dns.resolveTxt.bind(dns) },
    );
    assert.equal(st.statusCode, 200);
    const body = JSON.parse(st.body);
    assert.equal(body.enabled, true);
    assert.equal(body.clubId, 'club-ext');
    assert.equal(dns.calls, 1);

    const go = await handleGo(
      {
        requestContext: { http: { method: 'GET', path: '/go' } },
        rawPath: '/go',
        queryStringParameters: {
          host: 'ext.example',
          widgetGuid: w.widgetGuid,
          part: 'P1',
        },
      },
      {
        store,
        root,
        widgetEnv: 'sandbox',
        signupUrl: 'https://signup.example/join',
        resolveTxt: dns.resolveTxt.bind(dns),
      },
    );
    assert.equal(go.statusCode, 200);
    const goBody = JSON.parse(go.body);
    assert.equal(goBody.url, 'https://ext.example/p/1');
    assert.equal(dns.calls, 1);

    // Partner alone never enables extension
    const dns2 = countingResolver({
      'partneronly.example': [[`${PARTNER_PREFIX}p-only`]],
    });
    createWidget(store, {
      host: 'partneronly.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    const st2 = await extStatus({
      host: 'partneronly.example',
      store,
      resolveTxt: dns2.resolveTxt.bind(dns2),
    });
    assert.equal(st2.enabled, false);
    assert.equal(st2.clubId, null);
  });

  it('entry handler routes GET /ext/status', async () => {
    const dns = countingResolver({
      'route.example': [[`${CLUB_PREFIX}c1`]],
    });
    createWidget(store, {
      host: 'route.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    const res = await handler(
      {
        requestContext: { http: { method: 'GET', path: '/ext/status' } },
        rawPath: '/ext/status',
        queryStringParameters: { host: 'route.example' },
      },
      {},
      { store, resolveTxt: dns.resolveTxt.bind(dns) },
    );
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).enabled, true);
  });

  it('docs FR-200 Decision LOCKED + TXT prefixes', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'fr', 'FR-200.md'),
      'utf8',
    );
    assert.match(doc, /Decision \(LOCKED\)/);
    assert.match(doc, /a-search-club=/);
    assert.match(doc, /a-search-partner=/);
    assert.match(doc, /hostTxtStatus/);
    assert.match(doc, /EXT_STATUS_NEG_TTL_S/);
    const buf = fs.readFileSync(path.join(__dirname, '..', 'docs', 'fr', 'FR-200.md'));
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-200.md must be ASCII');
  });

  it('stack pins GET /ext/status route', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /path:\s*'\/ext\/status'/);
    assert.match(stack, /FR-200/);
  });
});
