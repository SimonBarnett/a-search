'use strict';

/**
 * FR-205 / #1193: per-widgetGuid context.md + searches.json (feedback fold, query caps).
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapWidget } = require('../shared/widgets/bootstrap');
const {
  SEARCH_QUERY_CAP_FREE,
  SEARCH_QUERY_CAP_FULL,
  isFullTier,
  queryCap,
  foldContextMd,
  foldExclude,
  boundQueries,
  runWidgetContextPass,
  readSearches,
} = require('../shared/widgets/agentWidgetContext');

describe('FR-205 ComponentsPiece agent widget context/searches', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';
  const widgetGuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr205-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('tier caps: free=3 fullTier=15; fullscreen alone is not full', () => {
    assert.equal(SEARCH_QUERY_CAP_FREE, 3);
    assert.equal(SEARCH_QUERY_CAP_FULL, 15);
    assert.equal(isFullTier({ upgraded: false, layout: 'fullscreen' }), false);
    assert.equal(isFullTier({ upgraded: true, layout: 'horizontal' }), false);
    assert.equal(isFullTier({ upgraded: true, layout: 'fullscreen' }), true);
    assert.equal(queryCap(false), 3);
    assert.equal(queryCap(true), 15);
  });

  it('boundQueries trims to cap and drops empty q', () => {
    const many = [];
    for (let i = 0; i < 20; i++) many.push({ q: 'q' + i, intent: 'cheap' });
    assert.equal(boundQueries(many, 3).length, 3);
    assert.deepEqual(boundQueries([{ q: '  ' }, { q: 'ok' }], 3), [
      { q: 'ok' },
    ]);
  });

  it('foldContextMd appends new feedback context without dropping prior', () => {
    const first = foldContextMd('', [{ type: 'context', text: 'Prefer boots', at: 't1' }], {
      host,
      widgetGuid,
    });
    assert.match(first, /Prefer boots/);
    const second = foldContextMd(
      first,
      [
        { type: 'context', text: 'Prefer boots', at: 't1' },
        { type: 'context', text: 'No kids gear', at: 't2' },
      ],
      { host, widgetGuid },
    );
    assert.equal((second.match(/Prefer boots/g) || []).length, 1);
    assert.match(second, /No kids gear/);
  });

  it('foldExclude merges removals idempotently', () => {
    const a = foldExclude([], [
      { type: 'removal', partId: 'P1', reason: 'wrong', at: 't1' },
      { type: 'removal', match: 'spam', reason: 'other', otherText: 'x', at: 't2' },
    ]);
    assert.equal(a.length, 2);
    const b = foldExclude(a, [
      { type: 'removal', partId: 'P1', reason: 'wrong', at: 't9' },
    ]);
    assert.equal(b.length, 2);
  });

  it('fixture widget: writes context.md, caps queries, folds feedback, keeps feedback.json', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    const dir = path.join(root, env, 'x', customerNumber, widgetGuid);
    const feedbackPath = path.join(dir, 'feedback.json');
    const feedback = [
      { type: 'context', text: 'Show trail boots', at: '2026-10-14T00:00:00Z' },
      {
        type: 'removal',
        partId: 'P99',
        reason: 'irrelevant',
        at: '2026-10-14T00:01:00Z',
      },
    ];
    fs.writeFileSync(feedbackPath, `${JSON.stringify(feedback, null, 2)}\n`, 'utf8');

    // Oversize prior queries must be capped to free=3.
    const searchesPath = path.join(dir, 'searches.json');
    const fat = [];
    for (let i = 0; i < 10; i++) fat.push({ q: 'deal ' + i, intent: 'cheap' });
    fs.writeFileSync(
      searchesPath,
      `${JSON.stringify({ queries: fat, exclude: [] }, null, 2)}\n`,
      'utf8',
    );

    const result = runWidgetContextPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      upgraded: false,
      layout: 'horizontal',
    });

    assert.equal(result.fullTier, false);
    assert.equal(result.queryCap, 3);
    assert.ok(fs.existsSync(result.contextPath));
    const md = fs.readFileSync(result.contextPath, 'utf8');
    assert.match(md, /Show trail boots/);
    assert.match(md, /widgetGuid: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/);

    const searches = readSearches(result.searchesPath);
    assert.equal(searches.queries.length, 3, 'fail-when: free queries exceed cap');
    assert.ok(searches.exclude.some((e) => e.partId === 'P99'));

    const feedbackAfter = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
    assert.equal(feedbackAfter.length, 2, 'fail-when: feedback.json entries deleted');
    assert.deepEqual(feedbackAfter, feedback);
  });

  it('fullTier allows up to 15 seeded queries', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'fullscreen',
    });
    const seeds = [];
    for (let i = 0; i < 20; i++) {
      seeds.push({ q: 'seed ' + i, intent: 'cheap', maxResults: 5 });
    }
    const result = runWidgetContextPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      upgraded: true,
      layout: 'fullscreen',
      seedQueries: seeds,
    });
    assert.equal(result.fullTier, true);
    assert.equal(result.queryCap, 15);
    const searches = readSearches(result.searchesPath);
    assert.equal(searches.queries.length, 15);
  });

  it('docs/fr/FR-205.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-205.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-205.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /widgetGuid/);
    assert.match(text, /feedback\.json/);
    assert.match(text, /SEARCH_QUERY_CAP_FREE|query cap/i);
    assert.match(text, /exclude/);
  });
});
