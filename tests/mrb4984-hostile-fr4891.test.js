'use strict';

/**
 * Hostile MRB #4984 / FR #4891: canonical APartsGateway /parts, enabled,
 * searching poll, promote on hasresults.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('MRB #4984 hostile FR #4891', () => {
  it('ASearchStack has no active httpApi.addRoutes path /parts', () => {
    const src = read('cdk/lib/a-search-stack.js');
    assert.match(src, /FR #4891/);
    assert.match(src, /APartsGateway only/);
    assert.equal(
      /httpApi\.addRoutes\(\s*\{[^}]*path:\s*['"]\/parts['"]/s.test(src),
      false,
    );
  });

  it('docs name PartsGatewayApiUrl as data-api-base and Searching for parts...', () => {
    const readme = read('cdk/README-parts-gateway.md');
    assert.match(readme, /PartsGatewayApiUrl/);
    assert.match(readme, /Searching for parts\.\.\./);
    assert.match(readme, /No parts found/);
    assert.match(readme, /enabled/);
    const piece = read('docs/components-piece.md');
    assert.match(piece, /PartsGatewayApiUrl/);
    assert.match(piece, /status.*searching/);
  });

  it('widget SEARCHING_TEXT / NO_PARTS_TEXT and pollWhileSearching doubling', () => {
    const w = read('widget/a-search-widget.js');
    assert.match(w, /Searching for parts\.\.\./);
    assert.match(w, /No parts found/);
    assert.match(w, /function pollWhileSearching/);
    assert.match(w, /POLL_MAX_DELAY_MS/);
    assert.match(w, /delay \* 2/);
    assert.match(w, /shouldStopPolling/);
  });

  it('promoteInToLive uses filterPartsByPage when page annotation present', () => {
    const src = read('shared/widgets/promoteInToLive.js');
    assert.match(src, /filterPartsByPage/);
    assert.match(src, /getObjectAnnotation/);
    assert.match(src, /setEnabled/);
    const done = read('shared/search/searchDone.js');
    assert.match(done, /promoteInToLive/);
    assert.match(done, /getObjectAnnotation: opts\.getObjectAnnotation/);
  });

  it('pageParts searching path does not promote; handler returns 202', () => {
    const page = read('parts-gateway/src/pageParts.js');
    assert.match(page, /status: 'searching'/);
    assert.equal(page.includes("require('../../shared/widgets/promoteInToLive')"), false);
    assert.equal(/\bsetInit\s*\(/.test(page), false);
    assert.equal(/\bsetEnabled\s*\(/.test(page), false);
    const handler = read('parts-gateway/src/handler.js');
    assert.match(handler, /status === 'searching'/);
    assert.match(handler, /jsonResponse\(202/);
    assert.match(handler, /retry-after/);
  });

  it('pollWhileSearching doubles delay and stops on ok', async () => {
    const {
      pollWhileSearching,
      SEARCHING_TEXT,
      NO_PARTS_TEXT,
    } = require('../widget/a-search-widget.js');
    assert.equal(SEARCHING_TEXT, 'Searching for parts...');
    assert.equal(NO_PARTS_TEXT, 'No parts found');

    const el = {
      attrs: Object.create(null),
      getAttribute(k) {
        return this.attrs[k] != null ? this.attrs[k] : null;
      },
      setAttribute(k, v) {
        this.attrs[k] = String(v);
      },
      removeAttribute(k) {
        delete this.attrs[k];
      },
      appendChild() {},
      ownerDocument: {
        createElement() {
          return { type: '', textContent: '', setAttribute() {} };
        },
      },
      innerHTML: '',
    };
    el.setAttribute('data-widget-guid', 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');

    const delays = [];
    let calls = 0;
    const page = await pollWhileSearching(
      el,
      {
        now: (() => {
          let t = 0;
          return () => {
            t += 1;
            return t;
          };
        })(),
        sleep: async (ms) => {
          delays.push(ms);
        },
        fetch: async () => {
          calls += 1;
          if (calls === 1) {
            return {
              ok: true,
              status: 202,
              headers: { get: () => '5' },
              json: async () => ({
                status: 'searching',
                parts: [],
                retryAfterMs: 5000,
                enabled: 0,
                init: 0,
              }),
            };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({
              status: 'ok',
              parts: [{ id: '1', title: 'part' }],
              enabled: 1,
              init: 1,
            }),
          };
        },
        apiBase: 'https://parts.example',
        n: 10,
        location: { pathname: '/x', host: 'club.example' },
        document: { hidden: false },
      },
      {
        status: 'searching',
        parts: [],
        retryAfterMs: 5000,
        enabled: 0,
        init: 0,
      },
      null,
    );
    assert.equal(page.status, 'ok');
    assert.ok(delays.length >= 1);
    assert.equal(delays[0], 5000);
    if (delays.length >= 2) {
      assert.equal(delays[1], 10000);
    }
  });
});
