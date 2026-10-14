'use strict';

/**
 * FR-199 / #1187: GET /go approved path by widgetGuid + part.
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
const { widgetFile } = require('../shared/widgets/widgetPath');
const { resolveGo, GoError } = require('../shared/widgets/go');
const { handleGo } = require('../entry/src/go');
const { handler } = require('../entry/src/index');

function writeLive(root, env, customerNumber, widgetGuid, parts) {
  const key = widgetFile(env, customerNumber, widgetGuid, 'live.json');
  const abs = path.join(root, ...key.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(parts, null, 2)}\n`, 'utf8');
  return abs;
}

describe('FR-199 ComponentsPiece GET /go approved path', () => {
  /** @type {string} */
  let root;
  /** @type {MemoryCustomersStore} */
  let store;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr199-'));
    store = new MemoryCustomersStore();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('approved host returns stamped url; same partNumber differs per widget', async () => {
    const w1 = createWidget(store, {
      host: 'shop.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    const w2 = createWidget(store, {
      host: 'shop.example',
      layout: 'vertical',
      createdVia: 'smartcatalogue',
    });
    updateCustomer(store, 'shop.example', {
      approved: true,
      clubId: 'club-42',
    });

    writeLive(root, 'sandbox', w1.customerNumber, w1.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'affiliate',
        source: 'amazon',
        url: 'https://www.amazon.co.uk/dp/B0001',
      },
    ]);
    writeLive(root, 'sandbox', w2.customerNumber, w2.widgetGuid, [
      {
        partNumber: 'P1',
        class: 'affiliate',
        source: 'amazon',
        url: 'https://www.amazon.co.uk/dp/B0002',
      },
    ]);

    const a = await resolveGo({
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w1.widgetGuid,
      part: 'P1',
      cid: 'cid-shared',
      store,
    });
    const b = await resolveGo({
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w2.widgetGuid,
      part: 'P1',
      cid: 'cid-shared',
      store,
    });
    assert.match(a.url, /B0001/);
    assert.match(b.url, /B0002/);
    assert.notEqual(a.url, b.url);
    assert.match(a.url, /tenantId=club-42/);
    assert.match(a.url, /clickId=cid-shared/);
    assert.ok(a.url, 'fail-when: url empty for known part');
  });

  it('merchant class returns plain url; missing part 404; mismatch 403', async () => {
    const w = createWidget(store, {
      host: 'm.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    updateCustomer(store, 'm.example', {
      approved: true,
      clubId: 'club-m',
    });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'M1',
        class: 'merchant',
        url: 'https://shop.example/product/1',
      },
    ]);

    const ok = await resolveGo({
      root,
      env: 'sandbox',
      host: 'm.example',
      widgetGuid: w.widgetGuid,
      part: 'M1',
      store,
    });
    assert.equal(ok.url, 'https://shop.example/product/1');

    await assert.rejects(
      () =>
        resolveGo({
          root,
          env: 'sandbox',
          host: 'm.example',
          widgetGuid: w.widgetGuid,
          part: 'NOPE',
          store,
        }),
      (err) => err instanceof GoError && err.code === 'part_not_found',
    );

    await assert.rejects(
      () =>
        resolveGo({
          root,
          env: 'sandbox',
          host: 'other.example',
          widgetGuid: w.widgetGuid,
          part: 'M1',
          store,
        }),
      (err) => err instanceof GoError && err.code === 'widget_host_mismatch',
    );
  });

  it('affiliate without clubId -> tracking_unavailable; HTTP handler shapes', async () => {
    const w = createWidget(store, {
      host: 'dark.example',
      layout: 'horizontal',
      createdVia: 'extension',
    });
    updateCustomer(store, 'dark.example', { approved: true, clubId: null });
    writeLive(root, 'sandbox', w.customerNumber, w.widgetGuid, [
      {
        partNumber: 'A1',
        class: 'affiliate',
        url: 'https://www.amazon.co.uk/dp/X',
      },
    ]);

    await assert.rejects(
      () =>
        resolveGo({
          root,
          env: 'sandbox',
          host: 'dark.example',
          widgetGuid: w.widgetGuid,
          part: 'A1',
          store,
        }),
      (err) => err instanceof GoError && err.code === 'tracking_unavailable',
    );

    updateCustomer(store, 'dark.example', { clubId: 'club-x' });
    const clicks = [];
    const res = await handleGo(
      {
        requestContext: { http: { method: 'GET', path: '/go' } },
        rawPath: '/go',
        queryStringParameters: {
          host: 'dark.example',
          widgetGuid: w.widgetGuid,
          part: 'A1',
          cid: 'c1',
        },
      },
      {
        root,
        store,
        widgetEnv: 'sandbox',
        recordClick: async (ev) => {
          clicks.push(ev);
        },
      },
    );
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.url);
    assert.equal(body.clickId, 'c1');
    assert.equal(clicks.length, 1);
    assert.equal(clicks[0].source, 'server');

    const viaEntry = await handler(
      {
        requestContext: { http: { method: 'GET', path: '/go' } },
        rawPath: '/go',
        queryStringParameters: {
          host: 'dark.example',
          widgetGuid: w.widgetGuid,
          part: 'A1',
        },
      },
      {},
      { root, store, widgetEnv: 'sandbox', env: { A_SEARCH_WIDGET_ROOT: root } },
    );
    assert.equal(viaEntry.statusCode, 200);

    const missing = await handleGo(
      {
        requestContext: { http: { method: 'GET', path: '/go' } },
        rawPath: '/go',
        queryStringParameters: {
          host: 'dark.example',
          widgetGuid: w.widgetGuid,
          part: 'ZZ',
        },
      },
      { root, store, widgetEnv: 'sandbox' },
    );
    assert.equal(missing.statusCode, 404);
    assert.equal(JSON.parse(missing.body).error, 'part_not_found');
  });
});
