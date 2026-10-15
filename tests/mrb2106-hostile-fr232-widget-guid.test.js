'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const {
  createWidget,
  isValidWidgetGuid,
  mintWidgetGuid,
} = require('../shared/widgets/createWidget');
const {
  MemoryCustomersStore,
  getDefaultCustomersStore,
  setDefaultCustomersStore,
} = require('../shared/components/customers');
const {
  migrateUriToGuid,
  widgetGuidForUriSlug,
} = require('../scripts/migrate-uri-to-guid');
const { hostDir } = require('../shared/widgets/widgetPath');

describe('mrb2106 hostile FR-232 widgetGuid', () => {
  /** @type {MemoryCustomersStore} */
  let store;
  beforeEach(() => {
    store = new MemoryCustomersStore();
    setDefaultCustomersStore(store);
  });

  it('FR-232 Decision LOCKED; FR-211 superseded; no BOM', () => {
    const fr = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-232.md'), 'utf8');
    assert.match(fr, /Decision \(LOCKED\)|Decision LOCKED/i);
    assert.match(fr, /#1346|1346/);
    assert.doesNotMatch(fr, /^\uFEFF/);
    const fr211 = fs.readFileSync(path.join(ROOT, 'docs', 'fr', 'FR-211.md'), 'utf8');
    assert.match(fr211, /Superseded by FR-232/i);
  });

  it('mint uses shared Customers store; bind-at-mint when host set', () => {
    const created = createWidget({
      layout: 'horizontal',
      createdVia: 'extension',
      host: 'Example.COM',
      store,
    });
    assert.ok(isValidWidgetGuid(created.widgetGuid));
    assert.equal(created.widgetGuid, created.widgetGuid.toLowerCase());
    const row = store.getWidget(created.widgetGuid);
    assert.ok(row);
    assert.equal(String(row.host).toLowerCase(), 'example.com');
    assert.match(created.snippet, /data-widget-guid=/);
    assert.doesNotMatch(created.snippet, /data-host=/);
  });

  it('widgetsCreate/parts/go share getDefaultCustomersStore', () => {
    for (const rel of [
      ['entry', 'src', 'widgetsCreate.js'],
      ['entry', 'src', 'parts.js'],
      ['entry', 'src', 'go.js'],
    ]) {
      const src = fs.readFileSync(path.join(ROOT, ...rel), 'utf8');
      assert.match(src, /getDefaultCustomersStore/);
    }
    assert.equal(getDefaultCustomersStore(), store);
  });

  it('migrate-uri-to-guid dry-run then apply then no-op', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrb2106-'));
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
    fs.writeFileSync(path.join(slugDir, 'live.json'), '[]\n', 'utf8');

    const expectedGuid = widgetGuidForUriSlug(host, 'products-page');
    assert.equal(expectedGuid[14], '5');

    const dry = migrateUriToGuid({ root, env: 'sandbox', apply: false, store });
    assert.equal(dry.dryRun, true);
    assert.equal(dry.planned.length, 1);
    assert.equal(dry.planned[0].widgetGuid, expectedGuid);

    const first = migrateUriToGuid({ root, env: 'sandbox', apply: true, store });
    assert.equal(first.applied.length, 1);
    assert.ok(store.getWidget(expectedGuid));

    const second = migrateUriToGuid({ root, env: 'sandbox', apply: true, store });
    assert.equal(second.applied.length, 0);
  });

  it('mintWidgetGuid lowercase v4; createWidget.js uses storeCreateWidget', () => {
    const g = mintWidgetGuid();
    assert.equal(g, g.toLowerCase());
    assert.ok(isValidWidgetGuid(g));
    const src = fs.readFileSync(
      path.join(ROOT, 'shared', 'widgets', 'createWidget.js'),
      'utf8',
    );
    assert.match(src, /getDefaultCustomersStore/);
    assert.match(src, /storeCreateWidget|createWidget:\s*storeCreateWidget/);
  });
});
