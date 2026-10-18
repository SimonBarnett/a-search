'use strict';

/**
 * FR-207 / #1195: prune expired/broken/excluded live parts; roll host top10.json.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapHost, bootstrapWidget } = require('../shared/widgets/bootstrap');
const { writeLive } = require('../shared/widgets/agentIngest');
const { readLiveArray } = require('../shared/widgets/parts');
const {
  TOP10_CAP,
  isExpired,
  isBroken,
  pruneParts,
  runPrunePass,
  rollHostTop10,
  runSweepPass,
} = require('../shared/widgets/agentPruneTop10');

describe('FR-207 ComponentsPiece agent prune + top10', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';
  const g1 = 'aaaaaaaa-bbbb-4ccc-8ddd-111111111111';
  const g2 = 'aaaaaaaa-bbbb-4ccc-8ddd-222222222222';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr207-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function livePath(guid) {
    return path.join(root, env, 'x', customerNumber, guid, 'live.json');
  }

  it('isExpired / isBroken helpers', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    assert.equal(isExpired({ expiresAt: '2026-10-13T00:00:00Z' }, now), true);
    assert.equal(isExpired({ expiresAt: '2026-10-15T00:00:00Z' }, now), false);
    assert.equal(isBroken({ broken: true }), true);
    assert.equal(isBroken({ url: '' }), true);
    assert.equal(isBroken({ title: 'ok' }), false);
    assert.equal(TOP10_CAP, 10);
  });

  it('pruneParts drops expired broken and exclude', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    const { kept, removed } = pruneParts(
      [
        { partNumber: 'A', title: 'keep', score: 1 },
        { partNumber: 'B', title: 'old', expiresAt: '2026-01-01T00:00:00Z', score: 9 },
        { partNumber: 'C', title: 'dead', broken: true, score: 9 },
        { partNumber: 'D', title: 'gone', score: 9 },
      ],
      { now, exclude: [{ partId: 'D', reason: 'owner' }] },
    );
    assert.deepEqual(
      kept.map((p) => p.partNumber),
      ['A'],
    );
    assert.equal(removed.length, 3);
  });

  it('prune removes expired and enforces free cap 10 on downgrade', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid: g1,
      host,
      layout: 'fullscreen',
    });
    const fat = [];
    for (let i = 0; i < 20; i++) {
      fat.push({
        partNumber: 'P' + i,
        title: 'Deal ' + i,
        price: i,
        score: i,
      });
    }
    fat.push({
      partNumber: 'OLD',
      title: 'Expired',
      score: 100,
      expiresAt: '2020-01-01T00:00:00Z',
    });
    writeLive(livePath(g1), fat);

    // Was fullTier-sized; downgrade (upgraded=false) must trim to 10 and drop expired.
    const r = runPrunePass({
      root,
      env,
      customerNumber,
      widgetGuid: g1,
      upgraded: false,
      layout: 'fullscreen',
      now: new Date('2026-10-14T12:00:00Z'),
    });
    assert.equal(r.liveCap, 10);
    assert.equal(r.after, 10);
    const live = readLiveArray(livePath(g1));
    assert.equal(live.length, 10);
    assert.equal(
      live.some((p) => p.partNumber === 'OLD'),
      false,
      'fail-when: expired not removed',
    );
    assert.equal(live[0].partNumber, 'P19');
  });

  it('sweep rolls host-level top10 capped at 10 across widgetGuids', () => {
    bootstrapHost({ root, env, customerNumber, host });
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid: g1,
      host,
      layout: 'horizontal',
    });
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid: g2,
      host,
      layout: 'horizontal',
    });
    writeLive(livePath(g1), [
      { partNumber: 'A1', title: 'A1', score: 5, price: 10 },
      { partNumber: 'A2', title: 'A2', score: 4, price: 11 },
    ]);
    const g2parts = [];
    for (let i = 0; i < 12; i++) {
      g2parts.push({
        partNumber: 'B' + i,
        title: 'B' + i,
        score: 20 - i,
        price: i,
      });
    }
    writeLive(livePath(g2), g2parts);

    const sweep = runSweepPass({
      root,
      env,
      customerNumber,
      upgraded: false,
      now: new Date('2026-10-14T12:00:00Z'),
    });
    assert.equal(sweep.widgets, 2);
    assert.equal(sweep.top10.length, 10, 'fail-when: top10 not capped');
    assert.ok(fs.existsSync(sweep.top10.top10Path));
    const doc = JSON.parse(fs.readFileSync(sweep.top10.top10Path, 'utf8'));
    assert.equal(doc.parts.length, 10);
    assert.equal(doc.rolledBy, 'fr-207-prune-top10');
    // No per-widget top10.json required.
    assert.equal(
      fs.existsSync(path.join(root, env, 'x', customerNumber, g1, 'top10.json')),
      false,
    );
  });

  it('rollHostTop10 alone caps length', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid: g1,
      host,
      layout: 'horizontal',
    });
    const parts = [];
    for (let i = 0; i < 15; i++) {
      parts.push({ partNumber: 'T' + i, title: 'T' + i, score: i, price: 1 });
    }
    writeLive(livePath(g1), parts);
    const roll = rollHostTop10({ root, env, customerNumber });
    assert.equal(roll.length, 10);
    assert.equal(roll.cap, 10);
  });

  it('docs/fr/FR-207.md Decision LOCKED ASCII', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-207.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-207.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /top10\.json/);
    assert.match(text, /widgetGuid/);
    assert.match(text, /exclude/);
    assert.match(text, /host-level|host level/i);
  });
});
