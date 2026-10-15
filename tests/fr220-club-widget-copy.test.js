'use strict';

/**
 * FR-220 / #1225: clubmadeira.uk widget copy page (same snippet rules as FR-219).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-220.md');
const CLUB_PAGE = path.join(
  ROOT,
  'components-piece',
  'widget-copy-clubmadeira',
  'index.html',
);
const SC_PAGE = path.join(
  ROOT,
  'components-piece',
  'widget-copy',
  'index.html',
);
const ENTRYPOINTS = path.join(
  ROOT,
  'shared',
  'widgets',
  'copyPageEntrypoints.js',
);

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const {
  createWidgetsRegistry,
  createWidget,
} = require('../shared/widgets/createWidget');
const { COPY_PAGE_ENTRYPOINTS } = require('../shared/widgets/copyPageEntrypoints');
const { handleWidgetsCreate } = require('../entry/src/widgetsCreate');

describe('FR-220 clubmadeira.uk widget copy page', () => {
  it('docs/fr/FR-220.md Decision LOCKED ASCII no-BOM', () => {
    const buf = fs.readFileSync(FR_DOC);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    for (const b of buf) assert.ok(b < 128, 'FR-220.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /clubmadeira\.uk/);
    assert.match(text, /createdVia.*clubmadeira|clubmadeira.*createdVia/i);
    assert.match(text, /smartcatalogue\.uk/);
    assert.match(text, /data-widget-guid/);
  });

  it('both site entrypoints pinned; club page uses clubmadeira createdVia', () => {
    assert.ok(fs.existsSync(SC_PAGE), 'smartcatalogue copy page');
    assert.ok(fs.existsSync(CLUB_PAGE), 'clubmadeira copy page');
    assert.ok(fs.existsSync(ENTRYPOINTS));

    const sites = COPY_PAGE_ENTRYPOINTS.map((e) => e.site).sort();
    assert.deepEqual(sites, ['clubmadeira.uk', 'smartcatalogue.uk']);

    const club = fs.readFileSync(CLUB_PAGE, 'utf8');
    assert.match(club, /clubmadeira\.uk/);
    assert.match(club, /createdVia:\s*['"]clubmadeira['"]|createdVia","clubmadeira"|'clubmadeira'/);
    assert.match(club, /\/widgets/);
    assert.match(club, /horizontal|vertical|fullscreen/);
    assert.match(club, /Full catalogue needs Upgrade|GBP 10/);
    assert.match(club, /club/i);
    for (const b of Buffer.from(club, 'utf8')) {
      assert.ok(b < 128, 'club copy page must be ASCII');
    }

    for (const ep of COPY_PAGE_ENTRYPOINTS) {
      const p = path.join(ROOT, ...ep.repoPath.split('/'));
      assert.ok(fs.existsSync(p), ep.repoPath);
    }
  });

  it('same snippet rules as FR-219 with createdVia clubmadeira; two copies => two GUIDs', async () => {
    const registry = createWidgetsRegistry();
    const a = createWidget({
      layout: 'horizontal',
      createdVia: 'clubmadeira',
      registry,
      widgetJsUrl: 'https://cdn.smartcatalogue.uk/a-search-widget.js',
    });
    const b = createWidget({
      layout: 'fullscreen',
      createdVia: 'clubmadeira',
      registry,
    });
    assert.match(a.widgetGuid, WIDGET_GUID_RE);
    assert.notEqual(a.widgetGuid, b.widgetGuid);
    assert.match(a.snippet, /data-widget-guid="/);
    assert.match(a.snippet, /data-mode="horizontal"/);
    assert.doesNotMatch(a.snippet, /shop\.example/i);
    assert.doesNotMatch(a.snippet, /data-host=/i);

    const res = await handleWidgetsCreate(
      {
        body: JSON.stringify({
          layout: 'vertical',
          createdVia: 'clubmadeira',
        }),
      },
      { registry },
    );
    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.body);
    assert.match(body.widgetGuid, WIDGET_GUID_RE);
    assert.match(body.snippet, /data-mode="vertical"/);
  });
});
