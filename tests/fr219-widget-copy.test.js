'use strict';

/**
 * FR-219 / #1224: smartcatalogue.uk widget copy page + POST /widgets mint.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-219.md');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const PAGE = path.join(
  ROOT,
  'components-piece',
  'widget-copy',
  'index.html',
);
const MOCK = path.join(
  ROOT,
  'docs',
  'mocks',
  'components-piece-partner',
  'home.html',
);

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const {
  createWidgetsRegistry,
  createWidget,
  buildEmbedSnippet,
  isValidWidgetGuid,
} = require('../shared/widgets/createWidget');
const {
  handleWidgetsCreate,
  matchWidgetsCreateRoute,
} = require('../entry/src/widgetsCreate');

describe('FR-219 widget copy page + POST /widgets', () => {
  it('docs/fr/FR-219.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-219.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /\/widgets/);
    assert.match(text, /data-widget-guid/);
    assert.match(text, /smartcatalogue/);
    assert.match(text, /fullscreen/i);
    assert.match(text, /Upgrade|GBP 10/i);
  });

  it('mint returns valid v4 GUID; two copies => two GUIDs; snippet has data-mode, no host', () => {
    const registry = createWidgetsRegistry();
    const a = createWidget({
      layout: 'horizontal',
      createdVia: 'smartcatalogue',
      registry,
      widgetJsUrl: 'https://cdn.smartcatalogue.uk/a-search-widget.js',
    });
    const b = createWidget({
      layout: 'vertical',
      createdVia: 'smartcatalogue',
      registry,
      widgetJsUrl: 'https://cdn.smartcatalogue.uk/a-search-widget.js',
    });
    assert.match(a.widgetGuid, WIDGET_GUID_RE);
    assert.match(b.widgetGuid, WIDGET_GUID_RE);
    assert.notEqual(a.widgetGuid, b.widgetGuid);
    assert.equal(registry.list().length, 2);

    assert.match(a.snippet, /data-widget-guid="/);
    assert.match(a.snippet, /data-mode="horizontal"/);
    assert.match(a.snippet, /a-search-widget\.js/);
    assert.doesNotMatch(a.snippet, /shop\.example/i);
    assert.doesNotMatch(a.snippet, /data-host=/i);
    assert.ok(isValidWidgetGuid(a.widgetGuid));

    const sn = buildEmbedSnippet({
      widgetGuid: a.widgetGuid,
      layout: 'fullscreen',
      widgetJsUrl: 'https://cdn.smartcatalogue.uk/a-search-widget.js',
    });
    assert.match(sn, /data-mode="fullscreen"/);
  });

  it('HTTP POST /widgets anonymous smartcatalogue; invalid layout 400', async () => {
    assert.equal(
      matchWidgetsCreateRoute('POST', '/widgets'),
      'POST /widgets',
    );
    const registry = createWidgetsRegistry();
    const res = await handleWidgetsCreate(
      {
        body: JSON.stringify({
          layout: 'fullscreen',
          createdVia: 'smartcatalogue',
        }),
      },
      { registry, widgetJsUrl: 'https://cdn.smartcatalogue.uk/a-search-widget.js' },
    );
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.match(body.widgetGuid, WIDGET_GUID_RE);
    assert.equal(body.layout, 'fullscreen');
    assert.match(body.snippet, /data-widget-guid="/);
    assert.match(body.snippet, /data-mode="fullscreen"/);

    const bad = await handleWidgetsCreate(
      { body: JSON.stringify({ layout: 'diagonal', createdVia: 'smartcatalogue' }) },
      { registry },
    );
    assert.equal(bad.statusCode, 400);
  });

  it('copy page + partner mock + CDK pins', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.match(html, /horizontal|vertical|fullscreen/);
    assert.match(html, /\/widgets/);
    assert.match(html, /smartcatalogue/);
    assert.match(html, /Full catalogue needs Upgrade|GBP 10/);
    assert.match(html, /data-widget-guid|widgetGuid/);
    for (const b of Buffer.from(html, 'utf8')) {
      assert.ok(b < 128, 'widget-copy page must be ASCII');
    }

    const mock = fs.readFileSync(MOCK, 'utf8');
    assert.match(mock, /data-widget-guid|data-mode/);
    assert.doesNotMatch(mock, /shop\.example/);

    const stack = fs.readFileSync(STACK, 'utf8');
    assert.match(stack, /path:\s*'\/widgets'/);
  });
});
