'use strict';

/**
 * FR-201 / #1189: embeddable widget boots by data-widget-guid + Parts API.
 */
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  boot,
  mountWidget,
  buildPartsUrl,
  resolveLayout,
  pageFullscreen,
  SELECTOR,
  BOOTED_ATTR,
} = require('../widget/a-search-widget');

/** Minimal DOM for node:test (no jsdom dependency). */
function makeDom(htmlBodies) {
  /** @type {Map<string, object>} */
  const byGuid = new Map();
  const elements = htmlBodies.map((cfg) => {
    const attrs = {
      class: 'a-search-widget',
      'data-widget-guid': cfg.guid,
      'data-mode': cfg.mode || 'horizontal',
    };
    if (cfg.apiBase) attrs['data-api-base'] = cfg.apiBase;
    const el = {
      attrs,
      innerHTML: '',
      children: [],
      ownerDocument: null,
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
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      insertBefore(node, ref) {
        const i = ref ? this.children.indexOf(ref) : -1;
        if (i >= 0) this.children.splice(i, 0, node);
        else this.children.push(node);
        return node;
      },
      querySelector(sel) {
        if (sel === '[data-action="page-more"]') {
          return (
            this.children.find(
              (c) => c.getAttribute && c.getAttribute('data-action') === 'page-more',
            ) || null
          );
        }
        return null;
      },
    };
    byGuid.set(cfg.guid, el);
    return el;
  });

  const doc = {
    elements,
    createElement(tag) {
      const attrs = {};
      const node = {
        tagName: String(tag).toUpperCase(),
        attrs,
        textContent: '',
        innerHTML: '',
        children: [],
        getAttribute(name) {
          return Object.prototype.hasOwnProperty.call(attrs, name)
            ? attrs[name]
            : null;
        },
        setAttribute(name, value) {
          attrs[name] = String(value);
        },
        appendChild(c) {
          this.children.push(c);
          return c;
        },
      };
      Object.defineProperty(node, 'type', {
        get() {
          return attrs.type;
        },
        set(v) {
          attrs.type = v;
        },
      });
      return node;
    },
    querySelectorAll(sel) {
      if (sel !== SELECTOR) return [];
      return this.elements.filter((el) => el.getAttribute('data-widget-guid'));
    },
  };
  for (const el of elements) el.ownerDocument = doc;
  return { doc, elements, byGuid };
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

describe('FR-201 ComponentsPiece widget JS', () => {
  it('buildPartsUrl includes host widgetGuid offset n and optional uri', () => {
    const u = buildPartsUrl('https://api.example', {
      host: 'shop.example',
      widgetGuid: '11111111-1111-4111-8111-111111111111',
      offset: 0,
      n: 3,
      uri: '/guides/boots',
    });
    assert.match(u, /^https:\/\/api\.example\/parts\?/);
    assert.match(u, /host=shop\.example/);
    assert.match(u, /widgetGuid=11111111-1111-4111-8111-111111111111/);
    assert.match(u, /offset=0/);
    assert.match(u, /n=3/);
    assert.match(u, /uri=%2Fguides%2Fboots/);
  });

  it('resolveLayout prefers API layout over data-mode', () => {
    assert.equal(resolveLayout('vertical', 'horizontal'), 'vertical');
    assert.equal(resolveLayout(null, 'fullscreen'), 'fullscreen');
    assert.equal(resolveLayout('', ''), 'horizontal');
  });

  it('two containers => two independent Parts calls and renders', async () => {
    const g1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const g2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const { doc, byGuid } = makeDom([
      { guid: g1, mode: 'horizontal' },
      { guid: g2, mode: 'vertical' },
    ]);
    const fetchFn = mockFetch(async (url) => {
      const guid = new URL(url, 'https://x').searchParams.get('widgetGuid');
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            customerNumber: '1',
            widgetGuid: guid,
            layout: guid === g1 ? 'horizontal' : 'fullscreen',
            parts: [
              {
                partNumber: guid === g1 ? 'P1' : 'P9',
                title: guid === g1 ? 'One' : 'Nine',
              },
            ],
            nextOffset: null,
          };
        },
      };
    });

    const results = await boot({
      document: doc,
      location: { host: 'shop.example', pathname: '/page' },
      fetch: fetchFn,
      apiBase: 'https://api.example',
    });
    assert.equal(results.length, 2);
    assert.equal(fetchFn.calls.length, 2);
    assert.match(fetchFn.calls[0].url, /widgetGuid=aaaaaaaa/);
    assert.match(fetchFn.calls[1].url, /widgetGuid=bbbbbbbb/);
    assert.match(fetchFn.calls[0].url, /uri=%2Fpage/);
    assert.equal(byGuid.get(g1).getAttribute('data-mode'), 'horizontal');
    assert.equal(byGuid.get(g2).getAttribute('data-mode'), 'fullscreen');
    assert.match(byGuid.get(g1).innerHTML, /data-part="P1"/);
    assert.match(byGuid.get(g2).innerHTML, /data-part="P9"/);
    assert.equal(byGuid.get(g1).getAttribute(BOOTED_ATTR), '1');
  });

  it('pasting script twice => no double render / second boot skips', async () => {
    const g = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const { doc, byGuid } = makeDom([{ guid: g, mode: 'horizontal' }]);
    let hits = 0;
    const fetchFn = mockFetch(async () => {
      hits += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            customerNumber: '1',
            widgetGuid: g,
            layout: 'horizontal',
            parts: [{ partNumber: 'P1', title: 'A' }],
            nextOffset: null,
          };
        },
      };
    });
    const deps = {
      document: doc,
      location: { host: 'shop.example', pathname: '/' },
      fetch: fetchFn,
      apiBase: '',
    };
    await boot(deps);
    await boot(deps);
    assert.equal(hits, 1);
    assert.equal(byGuid.get(g).getAttribute(BOOTED_ATTR), '1');
    const htmlOnce = byGuid.get(g).innerHTML;
    assert.equal((htmlOnce.match(/data-part="P1"/g) || []).length, 1);
  });

  it('modes only change layout attribute (API wins)', async () => {
    const g = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const { doc, byGuid } = makeDom([{ guid: g, mode: 'horizontal' }]);
    const fetchFn = mockFetch(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          customerNumber: '1',
          widgetGuid: g,
          layout: 'vertical',
          parts: [],
          nextOffset: null,
        };
      },
    }));
    await boot({
      document: doc,
      location: { host: 'shop.example', pathname: '/' },
      fetch: fetchFn,
      apiBase: 'https://api.example',
    });
    assert.equal(byGuid.get(g).getAttribute('data-mode'), 'vertical');
    assert.equal(byGuid.get(g).getAttribute('data-state'), 'empty');
  });

  it('pageFullscreen loads nextOffset and appends', async () => {
    const g = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const { doc, byGuid } = makeDom([{ guid: g, mode: 'fullscreen' }]);
    const el = byGuid.get(g);
    let page = 0;
    const fetchFn = mockFetch(async (url) => {
      const offset = Number(new URL(url, 'https://x').searchParams.get('offset'));
      page += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          if (offset === 0) {
            return {
              customerNumber: '1',
              widgetGuid: g,
              layout: 'fullscreen',
              parts: [{ partNumber: 'A', title: 'A' }],
              nextOffset: 1,
            };
          }
          return {
            customerNumber: '1',
            widgetGuid: g,
            layout: 'fullscreen',
            parts: [{ partNumber: 'B', title: 'B' }],
            nextOffset: null,
          };
        },
      };
    });
    await mountWidget(el, {
      document: doc,
      location: { host: 'shop.example', pathname: '/' },
      fetch: fetchFn,
      apiBase: 'https://api.example',
      n: 1,
    });
    assert.equal(el.getAttribute('data-next-offset'), '1');
    assert.match(el.innerHTML, /data-part="A"/);
    await pageFullscreen(el, {
      location: { host: 'shop.example', pathname: '/' },
      fetch: fetchFn,
      apiBase: 'https://api.example',
      n: 1,
    });
    assert.equal(el.getAttribute('data-next-offset'), null);
    assert.equal(page, 2);
  });

  it('docs FR-201 Decision LOCKED + widgetGuid boot', () => {
    const doc = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'fr', 'FR-201.md'),
      'utf8',
    );
    assert.match(doc, /Decision \(LOCKED\)/);
    assert.match(doc, /data-widget-guid/);
    assert.match(doc, /a-search-widget\.js/);
    assert.match(doc, /GET \/parts/);
    const buf = fs.readFileSync(path.join(__dirname, '..', 'docs', 'fr', 'FR-201.md'));
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-201.md must be ASCII');
  });
});
