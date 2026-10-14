'use strict';

/**
 * FR-197 / #1185: S3 customer tree bootstrap (widgetGuid, not uri-slug).
 * First host sight: _host.json. First widget bind: widget.json + live.json=[] + searches.json.
 * Paths only via shared/widgets/widgetPath.js. Second call idempotent.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  assertWidgetGuid,
  hostDir,
  widgetDir,
  widgetFile,
  physicalPrefix,
} = require('../shared/widgets/widgetPath');
const {
  bootstrapHost,
  bootstrapWidget,
} = require('../shared/widgets/bootstrap');

describe('FR-197 ComponentsPiece S3 bootstrap', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';
  const widgetGuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr197-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('widgetPath builds {env}/x/{customerNumber}/{widgetGuid}/ keys and validates GUID', () => {
    assert.equal(physicalPrefix(env), `${env}/x`);
    assert.equal(hostDir(env, customerNumber), `${env}/x/${customerNumber}`);
    assert.equal(
      widgetDir(env, customerNumber, widgetGuid),
      `${env}/x/${customerNumber}/${widgetGuid}`,
    );
    assert.equal(
      widgetFile(env, customerNumber, widgetGuid, 'live.json'),
      `${env}/x/${customerNumber}/${widgetGuid}/live.json`,
    );
    assert.equal(assertWidgetGuid(widgetGuid), widgetGuid);
    assert.throws(() => assertWidgetGuid('not-a-guid'), /invalid_widget_guid/);
    assert.throws(() => assertWidgetGuid(''), /invalid_widget_guid/);
  });

  it('bootstrap creates _host.json and widget files; second call idempotent', () => {
    const a = bootstrapHost({ root, env, customerNumber, host });
    assert.equal(a.created, true);
    const hostPath = path.join(root, env, 'x', customerNumber, '_host.json');
    assert.ok(fs.existsSync(hostPath), 'missing _host.json');
    const hostDoc = JSON.parse(fs.readFileSync(hostPath, 'utf8'));
    assert.equal(hostDoc.host, host);
    assert.equal(String(hostDoc.customerNumber), customerNumber);
    assert.ok(hostDoc.createdAt);
    // must not write site.md placeholder
    assert.equal(
      fs.existsSync(path.join(root, env, 'x', customerNumber, 'site.md')),
      false,
    );

    const w = bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
      createdVia: 'extension',
    });
    assert.equal(w.created, true);
    const livePath = path.join(
      root,
      env,
      'x',
      customerNumber,
      widgetGuid,
      'live.json',
    );
    const widgetPath = path.join(
      root,
      env,
      'x',
      customerNumber,
      widgetGuid,
      'widget.json',
    );
    const searchesPath = path.join(
      root,
      env,
      'x',
      customerNumber,
      widgetGuid,
      'searches.json',
    );
    assert.ok(fs.existsSync(livePath), 'missing live.json');
    assert.ok(fs.existsSync(widgetPath), 'missing widget.json');
    assert.ok(fs.existsSync(searchesPath), 'missing searches.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(livePath, 'utf8')), []);
    assert.deepEqual(JSON.parse(fs.readFileSync(searchesPath, 'utf8')), {
      queries: [],
      exclude: [],
    });
    const widgetDoc = JSON.parse(fs.readFileSync(widgetPath, 'utf8'));
    assert.equal(widgetDoc.widgetGuid, widgetGuid);
    assert.equal(widgetDoc.host, host);
    assert.equal(String(widgetDoc.customerNumber), customerNumber);
    assert.equal(widgetDoc.layout, 'horizontal');

    const stampHost = fs.statSync(hostPath).mtimeMs;
    const stampWidget = fs.statSync(widgetPath).mtimeMs;
    const b = bootstrapHost({ root, env, customerNumber, host });
    const c = bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'vertical',
      createdVia: 'smartcatalogue',
    });
    assert.equal(b.created, false);
    assert.equal(c.created, false);
    assert.equal(fs.statSync(hostPath).mtimeMs, stampHost);
    assert.equal(fs.statSync(widgetPath).mtimeMs, stampWidget);
    // existing widget.json not rewritten (layout stays horizontal)
    assert.equal(
      JSON.parse(fs.readFileSync(widgetPath, 'utf8')).layout,
      'horizontal',
    );
  });

  it('fail-when: bootstrapWidget leaves live.json present', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'fullscreen',
      createdVia: 'clubmadeira',
    });
    const livePath = path.join(
      root,
      env,
      'x',
      customerNumber,
      widgetGuid,
      'live.json',
    );
    assert.ok(fs.existsSync(livePath));
  });
});
