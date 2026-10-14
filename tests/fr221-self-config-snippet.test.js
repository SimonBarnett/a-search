'use strict';

/**
 * FR-221 / #1226: embed snippet self-configures from placement host.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FR_DOC = path.join(ROOT, 'docs', 'fr', 'FR-221.md');
const FR_201 = path.join(ROOT, 'docs', 'fr', 'FR-201.md');
const EMBED_DOC = path.join(ROOT, 'docs', 'components-piece-embed.md');
const WIDGET_JS = path.join(ROOT, 'widget', 'a-search-widget.js');

const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const {
  buildEmbedSnippet,
  DEFAULT_WIDGET_JS_URL,
} = require('../shared/widgets/snippet');
const {
  resolvePlacement,
  readWidgetGuidFromElement,
} = require('../shared/widgets/placement');

describe('FR-221 self-configuring embed snippet', () => {
  it('docs Decision LOCKED ASCII; cross-link FR-201; both-sites embed doc', () => {
    for (const p of [FR_DOC, EMBED_DOC]) {
      const buf = fs.readFileSync(p);
      assert.notEqual(buf[0], 0xef, p);
      for (const b of buf) assert.ok(b < 128, p + ' ASCII');
    }
    const text = fs.readFileSync(FR_DOC, 'utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /location\.host/);
    assert.match(text, /data-widget-guid/);
    assert.match(text, /FR-201/);
    assert.match(text, /smartcatalogue\.uk/);
    assert.match(text, /clubmadeira\.uk/);

    const fr201 = fs.readFileSync(FR_201, 'utf8');
    assert.match(fr201, /FR-221/);

    const embed = fs.readFileSync(EMBED_DOC, 'utf8');
    assert.match(embed, /smartcatalogue\.uk/);
    assert.match(embed, /clubmadeira\.uk/);
    assert.match(embed, /data-widget-guid/);
    assert.match(embed, /location\.host/);
  });

  it('snippet has valid data-widget-guid + data-mode; no host= default', () => {
    const guid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const sn = buildEmbedSnippet({
      widgetGuid: guid,
      layout: 'horizontal',
      widgetJsUrl: DEFAULT_WIDGET_JS_URL,
    });
    assert.match(sn, /data-widget-guid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"/);
    assert.match(sn, /data-mode="horizontal"/);
    assert.doesNotMatch(sn, /host=/i);
    assert.doesNotMatch(sn, /data-host=/i);
    assert.doesNotMatch(sn, /shop\.example/i);
    assert.match(guid, WIDGET_GUID_RE);
  });

  it('runtime resolvePlacement uses location.host; pathname diagnostics only', () => {
    const el = {
      getAttribute(name) {
        if (name === 'data-widget-guid') {
          return 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
        }
        if (name === 'data-mode') return 'vertical';
        return null;
      },
    };
    const placement = resolvePlacement({
      location: {
        host: 'club.example',
        hostname: 'club.example',
        pathname: '/offers/summer',
        href: 'https://club.example/offers/summer',
      },
      element: el,
    });
    assert.equal(placement.host, 'club.example');
    assert.equal(placement.widgetGuid, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    assert.equal(placement.layout, 'vertical');
    assert.equal(placement.pathname, '/offers/summer');
    assert.equal(placement.uriDiagnostics, '/offers/summer');
    assert.ok(!('uri' in placement && placement.uri === placement.widgetGuid));

    assert.equal(
      readWidgetGuidFromElement(el),
      'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    );

    assert.throws(
      () =>
        resolvePlacement({
          location: { host: 'x.example', pathname: '/' },
          element: { getAttribute: () => null },
        }),
      /widget_guid_required|invalid_widget_guid/,
    );
  });

  it('widget JS boots from location.host + data-widget-guid (no baked host)', () => {
    const js = fs.readFileSync(WIDGET_JS, 'utf8');
    assert.match(js, /location\.host/);
    assert.match(js, /data-widget-guid/);
    assert.doesNotMatch(js, /shop\.example/);
    assert.match(js, /resolvePlacement|placement\.host/);
    for (const b of Buffer.from(js, 'utf8')) {
      assert.ok(b < 128, 'widget JS ASCII');
    }
  });
});
