'use strict';

/**
 * FR-198 / #1186: GET /parts pages live.json by widgetGuid (not uri-slug).
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  MemoryCustomersStore,
  createWidget,
} = require('../shared/components/customers');
const { pageParts, PartsError } = require('../shared/widgets/parts');
const { handleParts } = require('../entry/src/parts');
const { handler } = require('../entry/src/index');

describe('FR-198 ComponentsPiece Parts API', () => {
  /** @type {string} */
  let root;
  /** @type {MemoryCustomersStore} */
  let store;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr198-'));
    store = new MemoryCustomersStore();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('pages live.json; empty array yields empty parts; nextOffset null', async () => {
    const w = createWidget(store, {
      layout: 'horizontal',
      createdVia: 'smartcatalogue',
    });
    assert.equal(w.host, null);

    const page = pageParts({
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w.widgetGuid,
      offset: 0,
      n: 10,
      store,
    });
    assert.equal(page.widgetGuid, w.widgetGuid);
    assert.equal(page.layout, 'horizontal');
    assert.ok(page.customerNumber);
    assert.deepEqual(page.parts, []);
    assert.equal(page.nextOffset, null);

    const livePath = path.join(
      root,
      'sandbox',
      'x',
      page.customerNumber,
      w.widgetGuid,
      'live.json',
    );
    assert.ok(fs.existsSync(livePath));
    assert.deepEqual(JSON.parse(fs.readFileSync(livePath, 'utf8')), []);

    // populate and page
    const parts = [
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
    ];
    fs.writeFileSync(livePath, `${JSON.stringify(parts)}\n`, 'utf8');
    const p1 = pageParts({
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w.widgetGuid,
      offset: 0,
      n: 2,
      store,
    });
    assert.deepEqual(p1.parts, parts.slice(0, 2));
    assert.equal(p1.nextOffset, 2);
    const p2 = pageParts({
      root,
      env: 'sandbox',
      host: 'shop.example',
      widgetGuid: w.widgetGuid,
      offset: 2,
      n: 2,
      store,
    });
    assert.deepEqual(p2.parts, parts.slice(2));
    assert.equal(p2.nextOffset, null);
  });

  it('errors: missing GUID, invalid GUID, host mismatch', () => {
    const w = createWidget(store, {
      host: 'a.example',
      layout: 'vertical',
      createdVia: 'extension',
    });
    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'a.example',
          widgetGuid: '',
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'widget_guid_required',
    );
    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'a.example',
          widgetGuid: 'not-a-guid',
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'invalid_widget_guid',
    );
    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'other.example',
          widgetGuid: w.widgetGuid,
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'widget_host_mismatch',
    );
  });

  it('HTTP handleParts + entry handler route GET /parts', async () => {
    const w = createWidget(store, {
      layout: 'fullscreen',
      createdVia: 'clubmadeira',
    });
    const event = {
      requestContext: { http: { method: 'GET', path: '/parts' } },
      rawPath: '/parts',
      queryStringParameters: {
        host: 'http.example',
        widgetGuid: w.widgetGuid,
        offset: '0',
        n: '5',
        uri: '/ignored',
      },
    };
    const res = await handleParts(event, {
      root,
      store,
      widgetEnv: 'sandbox',
    });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.widgetGuid, w.widgetGuid);
    assert.deepEqual(body.parts, []);
    assert.equal(body.nextOffset, null);

    const viaEntry = await handler(event, {}, {
      root,
      store,
      widgetEnv: 'sandbox',
      env: { A_SEARCH_WIDGET_ROOT: root },
    });
    assert.equal(viaEntry.statusCode, 200);
    assert.equal(JSON.parse(viaEntry.body).widgetGuid, w.widgetGuid);

    const missing = await handleParts(
      {
        requestContext: { http: { method: 'GET', path: '/parts' } },
        rawPath: '/parts',
        queryStringParameters: { host: 'http.example' },
      },
      { root, store },
    );
    assert.equal(missing.statusCode, 400);
    assert.equal(JSON.parse(missing.body).error, 'widget_guid_required');
  });
});
