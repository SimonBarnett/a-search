'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  MemoryCustomersStore,
  ensureCustomer,
  createWidget,
  setDefaultCustomersStore,
} = require('../shared/components/customers');
const {
  MemoryWidgetStatsStore,
  setDefaultWidgetStatsStore,
} = require('../shared/events/memoryWidgetStatsStore');
const {
  ingestWidgetEventsBatch,
  recordServerClick,
} = require('../shared/events/ingestBatch');
const { writeWidgetStatsJson } = require('../shared/events/rollupStatsJson');
const { handleWidgetEvents } = require('../entry/src/widgetEvents');
const { handleWidgetsStats } = require('../entry/src/widgetsStats');
const { isBotUserAgent } = require('../shared/events/botPatterns');
const widget = require('../widget/a-search-widget');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HOST = 'shop.example';
const NOW = Date.parse('2026-10-14T12:00:00.000Z');

describe('FR-234 / #1348 widget events + stats', () => {
  /** @type {MemoryCustomersStore} */
  let store;
  /** @type {MemoryWidgetStatsStore} */
  let stats;
  let customerNumber;

  beforeEach(() => {
    store = new MemoryCustomersStore();
    stats = new MemoryWidgetStatsStore();
    setDefaultCustomersStore(store);
    setDefaultWidgetStatsStore(stats);
    ensureCustomer(store, { host: HOST });
    const w = createWidget(store, {
      host: HOST,
      layout: 'horizontal',
      createdVia: 'extension',
    });
    // Force known GUID for fixtures
    store.widgets.delete(w.widgetGuid);
    w.widgetGuid = GUID;
    store.widgets.set(GUID, w);
    customerNumber = w.customerNumber;
  });

  it('two widgets view once each; resend same batch does not double-count', async () => {
    const g2 = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const w2 = createWidget(store, {
      host: HOST,
      layout: 'vertical',
      createdVia: 'extension',
    });
    store.widgets.delete(w2.widgetGuid);
    w2.widgetGuid = g2;
    store.widgets.set(g2, w2);

    const body = {
      v: 1,
      host: HOST,
      pageViewId: 'AAAAAAAAAAAAAAAAAAAAAA',
      sentAt: '2026-10-14T12:00:00.000Z',
      events: [
        {
          type: 'view',
          widgetGuid: GUID,
          partNumber: null,
          clickId: null,
          at: '2026-10-14T12:00:01.000Z',
        },
        {
          type: 'view',
          widgetGuid: g2,
          partNumber: null,
          clickId: null,
          at: '2026-10-14T12:00:01.000Z',
        },
      ],
    };
    const r1 = await ingestWidgetEventsBatch({
      body,
      store,
      statsStore: stats,
      env: 'sandbox',
      nowMs: NOW,
      applyInline: true,
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    assert.equal(r1.statusCode, 204);
    assert.equal(r1.applied, 2);
    const r2 = await ingestWidgetEventsBatch({
      body,
      store,
      statsStore: stats,
      env: 'sandbox',
      nowMs: NOW,
      applyInline: true,
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    assert.equal(r2.applied, 0);
    const rows = stats.listDaily({
      env: 'sandbox',
      widgetGuid: GUID,
      fromDay: '2026-10-14',
      toDay: '2026-10-14',
    });
    const v = rows.find((x) => x.partNumber === '');
    assert.equal(v.views, 1);
  });

  it('client click + server /go same clickId counts once; client-only flagged', () => {
    recordServerClick({
      statsStore: stats,
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      partNumber: 'p-1',
      clickId: 'BBBBBBBBBBBBBBBBBBBBBB',
      nowMs: NOW,
    });
    const again = recordServerClick({
      statsStore: stats,
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      partNumber: 'p-1',
      clickId: 'BBBBBBBBBBBBBBBBBBBBBB',
      nowMs: NOW,
    });
    assert.equal(again, false);
    const clientOnly = applyClientClick('CCCCCCCCCCCCCCCCCCCCCC');
    assert.equal(clientOnly, true);
    const rows = stats.listDaily({
      env: 'sandbox',
      widgetGuid: GUID,
      fromDay: '2026-10-14',
      toDay: '2026-10-14',
    });
    const widgetRow = rows.find((x) => x.partNumber === '');
    assert.equal(widgetRow.clicks, 2);
    assert.equal(widgetRow.clicksServer, 1);
    assert.equal(widgetRow.clicksClientOnly, 1);
  });

  function applyClientClick(clickId) {
    const key = `click|${clickId}`;
    if (!stats.tryDedupe(key, NOW + 48 * 3600 * 1000, NOW)) return false;
    stats.upsertDaily({
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      partNumber: '',
      day: '2026-10-14',
      clicks: 1,
      clicksClientOnly: 1,
    });
    return true;
  }

  it('bot UA, wd:1, Origin mismatch -> 204 and nothing counted', async () => {
    assert.equal(isBotUserAgent('Googlebot/2.1'), true);
    const body = {
      v: 1,
      host: HOST,
      pageViewId: 'page1',
      events: [
        {
          type: 'view',
          widgetGuid: GUID,
          partNumber: null,
          clickId: null,
          at: '2026-10-14T12:00:01.000Z',
        },
      ],
    };
    const bot = await ingestWidgetEventsBatch({
      body,
      store,
      statsStore: stats,
      nowMs: NOW,
      headers: { 'user-agent': 'Googlebot/2.1' },
    });
    assert.equal(bot.statusCode, 204);
    assert.equal(bot.applied, 0);
    const wd = await ingestWidgetEventsBatch({
      body: { ...body, wd: 1 },
      store,
      statsStore: stats,
      nowMs: NOW,
      headers: { 'user-agent': 'Mozilla/5.0' },
    });
    assert.equal(wd.applied, 0);
    const mism = await ingestWidgetEventsBatch({
      body,
      store,
      statsStore: stats,
      nowMs: NOW,
      headers: { 'user-agent': 'Mozilla/5.0' },
      originHost: 'evil.example',
    });
    assert.equal(mism.applied, 0);
    assert.ok((stats.dropped.get('bot_ua') || 0) >= 1);
  });

  it('no IP/UA/user id persisted in store dump', async () => {
    await ingestWidgetEventsBatch({
      body: {
        v: 1,
        host: HOST,
        pageViewId: 'page2',
        events: [
          {
            type: 'view',
            widgetGuid: GUID,
            partNumber: null,
            clickId: null,
            at: '2026-10-14T12:00:01.000Z',
          },
        ],
      },
      store,
      statsStore: stats,
      nowMs: NOW,
      headers: {
        'user-agent': 'Mozilla/5.0',
        'x-forwarded-for': '203.0.113.9',
      },
    });
    const dump = stats.dumpForSecretScan();
    assert.doesNotMatch(dump, /203\.0\.113/);
    assert.doesNotMatch(dump, /Mozilla\/5\.0/);
    assert.doesNotMatch(dump, /userId|user-agent|x-forwarded-for/i);
  });

  it('hourly rollup writes stats.json and does not enqueue agent jobs', () => {
    stats.upsertDaily({
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      partNumber: '',
      day: '2026-10-14',
      views: 10,
      clicks: 1,
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1348-stats-'));
    const agentQueue = { messages: [] };
    const r = writeWidgetStatsJson({
      statsStore: stats,
      root,
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      generatedAt: '2026-10-14T13:00:00.000Z',
      agentQueue,
    });
    assert.ok(fs.existsSync(r.file));
    assert.equal(agentQueue.messages.length, 0);
    const parsed = JSON.parse(fs.readFileSync(r.file, 'utf8'));
    assert.equal(parsed.windows['30d'].views, 10);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('GET /widgets/stats JWT; unauthorized host -> 403; empty -> zeros', async () => {
    const ok = await handleWidgetsStats(
      {
        rawPath: '/widgets/stats',
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { host: HOST, period: '30d' },
      },
      {
        verifyAuthorization: async () => ({ userId: 'U1' }),
        authorizeHost: async () => true,
        store,
        statsStore: stats,
        widgetEnv: 'sandbox',
        nowMs: NOW,
      },
    );
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.equal(body.totals.views, 0);
    assert.equal(body.totals.clicks, 0);

    const denied = await handleWidgetsStats(
      {
        rawPath: '/widgets/stats',
        headers: { authorization: 'Bearer x' },
        queryStringParameters: { host: HOST },
      },
      {
        verifyAuthorization: async () => ({ userId: 'U1' }),
        authorizeHost: async () => false,
        store,
        statsStore: stats,
        widgetEnv: 'sandbox',
        nowMs: NOW,
      },
    );
    assert.equal(denied.statusCode, 403);
  });

  it('entry POST /w/events returns 204', async () => {
    const res = await handleWidgetEvents(
      {
        body: JSON.stringify({
          v: 1,
          host: HOST,
          pageViewId: 'page3',
          events: [
            {
              type: 'view',
              widgetGuid: GUID,
              partNumber: null,
              clickId: null,
              at: '2026-10-14T12:00:01.000Z',
            },
          ],
        }),
        headers: {
          'user-agent': 'Mozilla/5.0',
          origin: 'https://shop.example',
        },
      },
      { store, statsStore: stats, widgetEnv: 'sandbox', nowMs: NOW },
    );
    assert.equal(res.statusCode, 204);
  });

  it('widget buildGoUrl includes cid; createEventBatcher flushes to /w/events', () => {
    const url = widget.buildGoUrl('https://api.example', {
      host: HOST,
      widgetGuid: GUID,
      part: 'p-1',
      cid: 'CID123',
    });
    assert.match(url, /cid=CID123/);
    const sent = [];
    const batcher = widget.createEventBatcher({
      apiBase: 'https://api.example',
      host: HOST,
      pageViewId: 'pv1',
      sendBeacon: (u, b) => {
        sent.push({ u, b });
        return true;
      },
    });
    batcher.trackView(GUID);
    batcher.flush();
    assert.equal(sent.length, 1);
    assert.match(sent[0].u, /\/w\/events$/);
    const payload = JSON.parse(sent[0].b);
    assert.equal(payload.events[0].type, 'view');
  });

  it('live/sandbox isolation: sandbox rows not listed under live', () => {
    stats.upsertDaily({
      env: 'sandbox',
      customerNumber,
      widgetGuid: GUID,
      partNumber: '',
      day: '2026-10-14',
      views: 3,
    });
    const live = stats.listDaily({
      env: 'live',
      widgetGuid: GUID,
      fromDay: '2026-10-01',
      toDay: '2026-10-31',
    });
    assert.equal(live.length, 0);
  });

  it('CDK source pins queue DLQ schedule and routes; migration never madeiradb', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /a-search-widget-events/);
    assert.match(stack, /WidgetEventsDeadLetterQueue/);
    assert.match(stack, /WidgetStatsRollupSchedule/);
    assert.match(stack, /path: '\/w\/events'/);
    assert.match(stack, /path: '\/widgets\/stats'/);
    const mig = fs.readFileSync(
      path.join(__dirname, '..', 'db', 'migrations', '016_WidgetStats.sql'),
      'utf8',
    );
    assert.match(mig, /^-- target: a_search/m);
    assert.doesNotMatch(mig, /USE\s+madeiradb/i);
    const createOnly = mig.replace(/^--.*$/gm, '');
    assert.doesNotMatch(createOnly, /UserAgent|Cookie|UserId|x-forwarded/i);
  });

  it('docs/fr/FR-234.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-234.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-234.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /POST \/w\/events/);
    assert.match(text, /stats\.json/);
    assert.match(text, /WidgetStatsDaily/);
  });

  it('agent ranking hard rules: exclude wins; no threshold pins in FR-234 docs', () => {
    const text = fs.readFileSync(
      path.join(__dirname, '..', 'docs', 'fr', 'FR-234.md'),
      'utf8',
    );
    assert.match(text, /exclude\[\]/);
    assert.doesNotMatch(text, /clicks30d \+ 1/);
    assert.doesNotMatch(text, /200 impressions/);
  });
});
