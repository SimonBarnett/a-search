'use strict';

/**
 * FR-203 / #1191: View deal -> GET /go?host&widgetGuid&part; no affiliate hrefs in markup.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildGoUrl, partsHtml, clickGo } = require('../widget/a-search-widget');

function makeWidgetEl(guid, host) {
  const attrs = {
    class: 'a-search-widget',
    'data-widget-guid': guid,
    'data-mode': 'horizontal',
  };
  if (host) attrs['data-host'] = host;
  return {
    attrs,
    innerHTML: '',
    children: [],
    ownerDocument: { createElement() { return { attrs: {}, setAttribute() {}, appendChild() {} }; } },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name)
        ? this.attrs[name]
        : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    querySelector() {
      return null;
    },
  };
}

function mockFetch(handler) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  fetchFn.calls = calls;
  return fetchFn;
}

function assertAsciiNoBom(buf, label) {
  assert.ok(buf.length === 0 || buf[0] !== 0xef, label + ': unexpected UTF-8 BOM');
  for (let i = 0; i < buf.length; i++) {
    assert.ok(buf[i] < 128, label + ': non-ASCII at ' + i);
  }
}

describe('FR-203 widget click via /go', () => {
  it('buildGoUrl uses host widgetGuid part (not uri)', () => {
    const u = buildGoUrl('https://api.example', {
      host: 'shop.example',
      widgetGuid: '11111111-1111-4111-8111-111111111111',
      part: 'P1001',
    });
    assert.match(u, /^https:\/\/api\.example\/go\?/);
    assert.match(u, /host=shop\.example/);
    assert.match(u, /widgetGuid=11111111-1111-4111-8111-111111111111/);
    assert.match(u, /part=P1001/);
    assert.equal(/uri=/.test(u), false);
  });

  it('partsHtml never embeds affiliate url/href on cards', () => {
    const aff = 'https://www.amazon.co.uk/dp/B0001?tag=aff-21';
    const html = partsHtml([
      {
        partNumber: 'P1',
        title: 'Boot',
        price: '10',
        url: aff,
        href: aff,
        image: 'https://cdn.example/img.png',
      },
    ]);
    assert.match(html, /data-part="P1"/);
    assert.match(html, /data-action="go"/);
    assert.match(html, /<button type="button"/);
    assert.equal(/href\s*=/i.test(html), false, 'fail-when: href= on card');
    assert.equal(html.includes(aff), false, 'fail-when: affiliate url embedded');
    assert.equal(html.includes('tag=aff-21'), false);
    // image src may be https CDN; that is not an affiliate destination link
    assert.match(html, /src="https:\/\/cdn\.example\/img\.png"/);
  });

  it('clickGo calls /go with host widgetGuid part and opens url', async () => {
    const g = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const el = makeWidgetEl(g);
    const opened = [];
    const dest = 'https://shop.example/out?clickId=c1';
    const fetchFn = mockFetch(async (url) => {
      assert.match(url, /\/go\?/);
      const q = new URL(url, 'https://x').searchParams;
      assert.equal(q.get('host'), 'shop.example');
      assert.equal(q.get('widgetGuid'), g);
      assert.equal(q.get('part'), 'P9');
      assert.equal(q.get('uri'), null);
      return {
        ok: true,
        status: 200,
        async json() {
          return { url: dest };
        },
      };
    });
    const body = await clickGo(el, 'P9', {
      location: { host: 'shop.example', pathname: '/ignored' },
      fetch: fetchFn,
      apiBase: 'https://api.example',
      openUrl(u) {
        opened.push(u);
      },
    });
    assert.equal(body.url, dest);
    assert.deepEqual(opened, [dest]);
    assert.equal(fetchFn.calls.length, 1);
    assert.match(fetchFn.calls[0].url, /widgetGuid=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
    assert.match(fetchFn.calls[0].url, /part=P9/);
  });

  it('clickGo soft-requires part and surfaces go_http_error', async () => {
    const g = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const el = makeWidgetEl(g, 'shop.example');
    await assert.rejects(
      () =>
        clickGo(el, '', {
          fetch: async () => ({ ok: true, json: async () => ({}) }),
          openUrl() {},
        }),
      (e) => e && e.code === 'part_required',
    );
    await assert.rejects(
      () =>
        clickGo(el, 'P1', {
          location: { host: 'shop.example' },
          fetch: async () => ({ ok: false, status: 403 }),
          openUrl() {},
        }),
      (e) => e && e.code === 'go_http_error',
    );
  });

  it('docs/fr/FR-203.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-203.md');
    const buf = fs.readFileSync(p);
    assertAsciiNoBom(buf, 'FR-203.md');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /widgetGuid/);
    assert.match(text, /GET \/go/);
    assert.match(text, /never embed|no.*href/i);
  });
});
