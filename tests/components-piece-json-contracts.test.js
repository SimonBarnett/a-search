'use strict';

/**
 * FR-212: ComponentsPiece JSON contract fixtures + schema pins.
 * Fixtures under tests/fixtures/components-piece/.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FIX = path.join(__dirname, 'fixtures', 'components-piece');
const LIVE_PART_CAP_FREE = 10;
const WIDGET_GUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const LAYOUTS = new Set(['horizontal', 'vertical', 'fullscreen']);
const CLASSES = new Set(['affiliate', 'merchant', 'provider']);
const REMOVE_REASONS = new Set([
  'not_relevant',
  'too_expensive',
  'broken_or_out_of_stock',
  'wrong_brand_or_merchant',
  'inappropriate',
  'other',
]);
const EVENT_TYPES = new Set(['view', 'part_impression', 'click']);

/** Keys that must never appear in ComponentsPiece fixtures (PII / secrets). */
const FORBIDDEN_KEY_RE =
  /^(password|passwd|api[_-]?key|secret|token|access[_-]?token|refresh[_-]?token|authorization|bearer|private[_-]?key|nickserv|sasl|ip|ua|user[_-]?id|email|cookie)$/i;

const AFFILIATE_URL_PARAM_RE =
  /(?:[?&#]|^)(?:awinaffid|campid|subId1|u1|tag)=/i;

function readJson(name) {
  const p = path.join(FIX, name);
  assert.ok(fs.existsSync(p), `missing fixture ${name}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function walkKeys(value, visit, trail = []) {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkKeys(v, visit, trail.concat(String(i))));
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    visit(k, v, trail.concat(k));
    walkKeys(v, visit, trail.concat(k));
  }
}

function assertNoForbiddenKeys(doc, label) {
  walkKeys(doc, (k) => {
    assert.ok(
      !FORBIDDEN_KEY_RE.test(k),
      `${label}: forbidden key ${k}`,
    );
  });
}

function assertInItem(item, label) {
  for (const f of [
    'id',
    'title',
    'price',
    'currency',
    'merchant',
    'image',
    'url',
    'seenAt',
  ]) {
    assert.ok(item[f] !== undefined && item[f] !== null, `${label} missing ${f}`);
  }
  assert.equal(typeof item.url, 'string');
  assert.ok(!AFFILIATE_URL_PARAM_RE.test(item.url), `${label} url has affiliate params`);
}

function assertLiveItem(item, label) {
  assertInItem(item, label);
  for (const f of ['partNumber', 'score', 'expiresAt', 'source', 'class']) {
    assert.ok(item[f] !== undefined && item[f] !== null, `${label} missing ${f}`);
  }
  assert.ok(CLASSES.has(item.class), `${label} bad class ${item.class}`);
  if (item.class === 'merchant') {
    assert.ok(item.shopId, `${label} merchant needs shopId`);
  }
  assert.ok(!AFFILIATE_URL_PARAM_RE.test(item.url), `${label} live url must be clean destination`);
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}

describe('FR-212 ComponentsPiece JSON contracts', () => {
  it('fixture files exist under tests/fixtures/components-piece/', () => {
    for (const name of [
      path.join('IN', 'search-sample.json'),
      'live.free.json',
      'live.full.json',
      'searches.json',
      'widget.json',
      'feedback.json',
      '_host.json',
      'sqs.job.json',
      'events.batch.json',
      'stats.widget.json',
      'stats.host.json',
      'stats.api.json',
    ]) {
      assert.ok(fs.existsSync(path.join(FIX, name)), name);
    }
  });

  it('IN/search-sample.json items have required fields and no secret keys', () => {
    const doc = readJson(path.join('IN', 'search-sample.json'));
    assert.ok(Array.isArray(doc) && doc.length >= 1);
    assertNoForbiddenKeys(doc, 'IN/search-sample.json');
    doc.forEach((item, i) => assertInItem(item, `in[${i}]`));
  });

  it('live.free.json length <= LIVE_PART_CAP_FREE; live.full.json > free cap', () => {
    const free = readJson('live.free.json');
    const full = readJson('live.full.json');
    assert.ok(Array.isArray(free));
    assert.ok(Array.isArray(full));
    assert.equal(free.length, LIVE_PART_CAP_FREE);
    assert.ok(free.length <= LIVE_PART_CAP_FREE);
    assert.ok(full.length > LIVE_PART_CAP_FREE);
    assertNoForbiddenKeys(free, 'live.free');
    assertNoForbiddenKeys(full, 'live.full');
    free.forEach((item, i) => assertLiveItem(item, `live.free[${i}]`));
    full.forEach((item, i) => assertLiveItem(item, `live.full[${i}]`));
  });

  it('searches.json has queries[] and exclude[] shapes', () => {
    const doc = readJson('searches.json');
    assert.ok(Array.isArray(doc.queries));
    assert.ok(Array.isArray(doc.exclude));
    assertNoForbiddenKeys(doc, 'searches');
    for (const q of doc.queries) {
      assert.equal(typeof q.q, 'string');
      assert.ok(q.q.length > 0);
    }
    for (const ex of doc.exclude) {
      assert.equal(typeof ex.reason, 'string');
      assert.equal(typeof ex.at, 'string');
    }
  });

  it('widget.json + _host.json + sqs.job.json GUID and layouts', () => {
    const w = readJson('widget.json');
    const h = readJson('_host.json');
    const job = readJson('sqs.job.json');
    assert.match(w.widgetGuid, WIDGET_GUID_RE);
    assert.ok(LAYOUTS.has(w.layout));
    assert.equal(typeof w.host, 'string');
    assert.equal(typeof w.customerNumber, 'string');
    assert.equal(typeof w.createdVia, 'string');
    assert.equal(typeof w.createdAt, 'string');
    assert.equal(h.host, w.host);
    assert.equal(h.customerNumber, w.customerNumber);
    assert.equal(typeof h.createdAt, 'string');
    assert.equal(typeof job.eventType, 'string');
    assert.equal(typeof job.env, 'string');
    assert.equal(job.customerNumber, w.customerNumber);
    assert.equal(job.host, w.host);
    if (job.widgetGuid !== null) assert.match(job.widgetGuid, WIDGET_GUID_RE);
    assertNoForbiddenKeys(w, 'widget');
    assertNoForbiddenKeys(h, '_host');
    assertNoForbiddenKeys(job, 'sqs.job');
  });

  it('feedback.json context/remove entries and reason enum', () => {
    const doc = readJson('feedback.json');
    assert.ok(Array.isArray(doc.entries));
    assertNoForbiddenKeys(doc, 'feedback');
    for (const e of doc.entries) {
      assert.ok(e.type === 'context' || e.type === 'remove', e.type);
      assert.equal(typeof e.byUserId, 'string');
      assert.equal(typeof e.at, 'string');
      if (e.type === 'context') {
        assert.equal(typeof e.text, 'string');
      } else {
        assert.equal(typeof e.partNumber, 'string');
        assert.ok(REMOVE_REASONS.has(e.reason), e.reason);
        if (e.reason === 'other') {
          assert.equal(typeof e.otherText, 'string');
          assert.ok(e.otherText.length > 0);
        }
      }
    }
  });

  it('events.batch.json shape, caps, and no PII keys', () => {
    const doc = readJson('events.batch.json');
    assert.equal(doc.v, 1);
    assert.equal(typeof doc.host, 'string');
    assert.equal(typeof doc.pageViewId, 'string');
    assert.equal(typeof doc.sentAt, 'string');
    assert.ok(Array.isArray(doc.events));
    assert.ok(doc.events.length >= 1);
    assert.ok(doc.events.length <= 50);
    assertNoForbiddenKeys(doc, 'events.batch');
    for (const ev of doc.events) {
      assert.ok(EVENT_TYPES.has(ev.type), ev.type);
      assert.match(ev.widgetGuid, WIDGET_GUID_RE);
      assert.equal(typeof ev.at, 'string');
      if (ev.type === 'part_impression' || ev.type === 'click') {
        assert.equal(typeof ev.partNumber, 'string');
        assert.ok(ev.partNumber.length > 0);
      }
      if (ev.type === 'click') {
        assert.equal(typeof ev.clickId, 'string');
        assert.ok(ev.clickId.length > 0);
      }
    }
  });

  it('stats fixtures: ctr 0 when denom 0; ctr rounded to 4 dp; no PII', () => {
    const w = readJson('stats.widget.json');
    const h = readJson('stats.host.json');
    const api = readJson('stats.api.json');
    assert.match(w.widgetGuid, WIDGET_GUID_RE);
    assertNoForbiddenKeys(w, 'stats.widget');
    assertNoForbiddenKeys(h, 'stats.host');
    assertNoForbiddenKeys(api, 'stats.api');

    for (const win of Object.values(w.windows)) {
      const expected =
        win.views === 0 ? 0 : round4(win.clicks / win.views);
      assert.equal(win.ctr, expected);
    }
    for (const p of w.parts) {
      const expected =
        p.impressions30d === 0 ? 0 : round4(p.clicks30d / p.impressions30d);
      assert.equal(p.ctr30d, expected);
    }
    assert.equal(typeof api.host, 'string');
    assert.ok(Array.isArray(api.widgets));
  });

  it('docs/fr/FR-212.md Decision LOCKED ASCII', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'fr', 'FR-212.md'),
      'utf8',
    );
    assert.match(text, /Decision \(LOCKED\)/);
    assert.match(text, /tests\/fixtures\/components-piece/);
    assert.match(text, /LIVE_PART_CAP_FREE/);
    assert.doesNotMatch(text, /[\u2013\u2014]/);
  });
});
