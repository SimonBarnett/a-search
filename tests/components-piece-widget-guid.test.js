'use strict';

/**
 * FR-232 / #1346: widgetGuid minted at embed-code creation (replaces uri-slug).
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MemoryCustomersStore,
  setDefaultCustomersStore,
  createWidget: storeCreateWidget,
} = require('../shared/components/customers');
const {
  createWidget,
  createWidgetsRegistry,
  buildEmbedSnippet,
  isValidWidgetGuid,
  WIDGET_GUID_RE,
} = require('../shared/widgets/createWidget');
const {
  assertWidgetGuid,
  widgetDir,
  widgetFile,
  hostDir,
} = require('../shared/widgets/widgetPath');
const { pageParts, PartsError } = require('../shared/widgets/parts');
const { handleWidgetsCreate } = require('../entry/src/widgetsCreate');
const {
  migrateUriToGuid,
  widgetGuidForUriSlug,
  uuidV5,
  URI_TO_GUID_NAMESPACE,
} = require('../scripts/migrate-uri-to-guid');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-232.md');
const FR_211 = path.join(ROOT, 'docs', 'fr', 'FR-211.md');

const V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('FR-232 widgetGuid identity', () => {
  /** @type {string} */
  let root;
  /** @type {MemoryCustomersStore} */
  let store;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr232-'));
    store = new MemoryCustomersStore();
    setDefaultCustomersStore(store);
  });

  afterEach(() => {
    setDefaultCustomersStore(null);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('docs/fr/FR-232.md Decision LOCKED; FR-211 superseded; ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-232.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /widgetGuid/);
    assert.match(text, /POST\s*\/widgets/);
    assert.match(text, /widget_host_mismatch/);
    assert.match(text, /migrate-uri-to-guid/);

    const fr211 = fs.readFileSync(FR_211, 'utf8');
    assert.match(fr211, /[Ss]uperseded by FR-232|#1346/);
  });

  it('mint returns valid v4 GUID; two mints => two GUIDs and two rows', () => {
    const registry = createWidgetsRegistry();
    const a = createWidget({
      layout: 'horizontal',
      createdVia: 'smartcatalogue',
      store,
      registry,
    });
    const b = createWidget({
      layout: 'vertical',
      createdVia: 'clubmadeira',
      store,
      registry,
    });
    assert.match(a.widgetGuid, V4_RE);
    assert.match(b.widgetGuid, V4_RE);
    assert.notEqual(a.widgetGuid, b.widgetGuid);
    assert.equal(registry.list().length, 2);
    assert.ok(store.getWidget(a.widgetGuid));
    assert.ok(store.getWidget(b.widgetGuid));
    assert.equal(a.host, null);
    assert.equal(a.boundAt, null);
  });

  it('snippet has data-widget-guid + data-mode and no host literal', () => {
    const created = createWidget({
      layout: 'fullscreen',
      createdVia: 'extension',
      host: 'shop.example',
      store,
    });
    assert.match(created.snippet, /data-widget-guid="/);
    assert.match(created.snippet, /data-mode="fullscreen"/);
    assert.doesNotMatch(created.snippet, /shop\.example/i);
    assert.doesNotMatch(created.snippet, /data-host=/i);
    assert.equal(created.host, 'shop.example');
    assert.ok(created.boundAt);
    assert.ok(created.customerNumber);
  });

  it('two widgets on one host => two folders, two independent live.json', () => {
    const w1 = storeCreateWidget(store, {
      layout: 'horizontal',
      createdVia: 'extension',
      host: 'club.example',
    });
    const w2 = storeCreateWidget(store, {
      layout: 'vertical',
      createdVia: 'extension',
      host: 'club.example',
    });
    assert.equal(w1.customerNumber, w2.customerNumber);

    pageParts({
      root,
      env: 'sandbox',
      host: 'club.example',
      widgetGuid: w1.widgetGuid,
      offset: 0,
      n: 5,
      store,
    });
    pageParts({
      root,
      env: 'sandbox',
      host: 'club.example',
      widgetGuid: w2.widgetGuid,
      offset: 0,
      n: 5,
      store,
    });

    const live1 = path.join(
      root,
      ...widgetFile('sandbox', w1.customerNumber, w1.widgetGuid, 'live.json').split(
        '/',
      ),
    );
    const live2 = path.join(
      root,
      ...widgetFile('sandbox', w2.customerNumber, w2.widgetGuid, 'live.json').split(
        '/',
      ),
    );
    assert.ok(fs.existsSync(live1));
    assert.ok(fs.existsSync(live2));
    assert.notEqual(live1, live2);

    fs.writeFileSync(live1, '[{"partNumber":"A"}]\n', 'utf8');
    fs.writeFileSync(live2, '[{"partNumber":"B"}]\n', 'utf8');
    const p1 = pageParts({
      root,
      env: 'sandbox',
      host: 'club.example',
      widgetGuid: w1.widgetGuid,
      offset: 0,
      n: 10,
      store,
    });
    const p2 = pageParts({
      root,
      env: 'sandbox',
      host: 'club.example',
      widgetGuid: w2.widgetGuid,
      offset: 0,
      n: 10,
      store,
    });
    assert.equal(p1.parts[0].partNumber, 'A');
    assert.equal(p2.parts[0].partNumber, 'B');
  });

  it('first /parts from host A binds; same GUID from host B => 403 widget_host_mismatch', () => {
    const w = createWidget({
      layout: 'horizontal',
      createdVia: 'smartcatalogue',
      store,
    });
    assert.equal(w.host, null);

    const page = pageParts({
      root,
      env: 'sandbox',
      host: 'host-a.example',
      widgetGuid: w.widgetGuid,
      offset: 0,
      n: 5,
      store,
    });
    assert.equal(page.widgetGuid, w.widgetGuid);
    const bound = store.getWidget(w.widgetGuid);
    assert.equal(bound.host, 'host-a.example');
    assert.ok(bound.customerNumber);

    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'host-b.example',
          widgetGuid: w.widgetGuid,
          offset: 0,
          n: 5,
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'widget_host_mismatch',
    );
  });

  it('invalid GUID / path traversal => 400; no S3 key built', () => {
    assert.throws(() => assertWidgetGuid('../etc/passwd'), /invalid_widget_guid/);
    assert.throws(() => assertWidgetGuid('not-a-guid'), /invalid_widget_guid/);
    assert.throws(
      () => widgetDir('sandbox', '1', '../x'),
      /invalid_widget_guid/,
    );
    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'shop.example',
          widgetGuid: 'bad',
          offset: 0,
          n: 5,
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'invalid_widget_guid',
    );
    // root must stay empty of traversal attempts
    const entries = fs.existsSync(root) ? fs.readdirSync(root) : [];
    assert.equal(entries.length, 0);
  });

  it('missing widgetGuid => 400 widget_guid_required', () => {
    assert.throws(
      () =>
        pageParts({
          root,
          env: 'sandbox',
          host: 'shop.example',
          widgetGuid: '',
          offset: 0,
          n: 5,
          store,
        }),
      (err) => err instanceof PartsError && err.code === 'widget_guid_required',
    );
  });

  it('POST /widgets shares store with /parts bind path', async () => {
    const res = await handleWidgetsCreate(
      {
        body: JSON.stringify({
          layout: 'horizontal',
          createdVia: 'smartcatalogue',
        }),
      },
      { store },
    );
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.match(body.widgetGuid, V4_RE);
    assert.ok(isValidWidgetGuid(body.widgetGuid));

    const page = pageParts({
      root,
      env: 'sandbox',
      host: 'copy.example',
      widgetGuid: body.widgetGuid,
      offset: 0,
      n: 5,
      store,
    });
    assert.equal(page.widgetGuid, body.widgetGuid);
  });

  it('migration: dry-run lists uri-slug; apply moves; second apply no-op', () => {
    const customerNumber = '42';
    const host = 'legacy.example';
    const absHost = path.join(root, ...hostDir('sandbox', customerNumber).split('/'));
    fs.mkdirSync(absHost, { recursive: true });
    fs.writeFileSync(
      path.join(absHost, '_host.json'),
      JSON.stringify({ host, customerNumber }, null, 2) + '\n',
      'utf8',
    );
    const slugDir = path.join(absHost, 'products-page');
    fs.mkdirSync(slugDir, { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, 'live.json'),
      '[{"partNumber":"LEGACY"}]\n',
      'utf8',
    );

    const expectedGuid = widgetGuidForUriSlug(host, 'products-page');
    assert.match(expectedGuid, WIDGET_GUID_RE);
    assert.equal(expectedGuid[14], '5'); // version nibble

    const dry = migrateUriToGuid({
      root,
      env: 'sandbox',
      apply: false,
      store,
    });
    assert.equal(dry.planned.length, 1);
    assert.equal(dry.planned[0].uriSlug, 'products-page');
    assert.equal(dry.planned[0].widgetGuid, expectedGuid);
    assert.ok(fs.existsSync(slugDir));

    const first = migrateUriToGuid({
      root,
      env: 'sandbox',
      apply: true,
      store,
    });
    assert.equal(first.applied.length, 1);
    assert.equal(first.applied[0].action, 'migrated');
    assert.ok(!fs.existsSync(slugDir));
    const destLive = path.join(
      root,
      ...widgetFile('sandbox', customerNumber, expectedGuid, 'live.json').split(
        '/',
      ),
    );
    assert.ok(fs.existsSync(destLive));
    const migLog = path.join(absHost, '_migration', 'uri-to-guid.json');
    assert.ok(fs.existsSync(migLog));
    assert.ok(store.getWidget(expectedGuid));

    const second = migrateUriToGuid({
      root,
      env: 'sandbox',
      apply: true,
      store,
    });
    assert.equal(second.planned.length, 0);
    assert.equal(second.applied.length, 0);

    // deterministic v5
    assert.equal(
      uuidV5(`${host}\nproducts-page`, URI_TO_GUID_NAMESPACE),
      expectedGuid,
    );
  });

  it('fail-when: widgetPath never builds keys from uri', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'widgetPath.js'),
      'utf8',
    );
    assert.doesNotMatch(src, /\buriSlug\b/);
    assert.doesNotMatch(src, /\buri-slug\b/);
    assert.match(src, /assertWidgetGuid/);
    const partsSrc = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'parts.js'),
      'utf8',
    );
    assert.match(partsSrc, /widgetGuid/);
    assert.doesNotMatch(partsSrc, /widgetDir\([^)]*uri/);
  });

  it('buildEmbedSnippet rejects invalid guid', () => {
    assert.throws(
      () =>
        buildEmbedSnippet({
          widgetGuid: 'nope',
          layout: 'horizontal',
        }),
      (err) => err && err.code === 'invalid_widget_guid',
    );
  });
});
