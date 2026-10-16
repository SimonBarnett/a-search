'use strict';

/**
 * FR-206 / #1194 + FR-3344: ingest IN/*.json into live.json then delete (tier cap + exclude).
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapWidget } = require('../shared/widgets/bootstrap');
const { readLiveArray } = require('../shared/widgets/parts');
const {
  LIVE_PART_CAP_FREE,
  LIVE_PART_CAP_FULL,
  IN_DIR_NAME,
  livePartCap,
  mapInItem,
  selectWithinCap,
  runIngestPass,
  writeInSearchFile,
} = require('../shared/widgets/agentIngest');

describe('FR-206 ComponentsPiece agent IN/ folder ingest', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';
  const widgetGuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr206-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function widgetDir() {
    return path.join(root, env, 'x', customerNumber, widgetGuid);
  }

  function writeIn(parts) {
    return writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 'batch',
      parts,
    });
  }

  it('caps: free=10 full=500; mapInItem requires id', () => {
    assert.equal(LIVE_PART_CAP_FREE, 10);
    assert.equal(LIVE_PART_CAP_FULL, 500);
    assert.equal(livePartCap(false), 10);
    assert.equal(livePartCap(true), 500);
    assert.equal(mapInItem({}, 0), null);
    const m = mapInItem({ id: 'P1', title: 'A', price: 9.5, score: 2 }, 0);
    assert.equal(m.partNumber, 'P1');
    assert.equal(m.price, 9.5);
    assert.equal(m.score, 2);
  });

  it('selectWithinCap ranks score desc then price asc', () => {
    const picked = selectWithinCap(
      [
        { partNumber: 'A', score: 1, price: 1 },
        { partNumber: 'B', score: 5, price: 99 },
        { partNumber: 'C', score: 5, price: 10 },
      ],
      2,
    );
    assert.deepEqual(
      picked.map((p) => p.partNumber),
      ['C', 'B'],
    );
  });

  it('25 incoming free widget -> live length 10; IN/*.json gone; re-run unchanged', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    const incoming = [];
    for (let i = 0; i < 25; i++) {
      incoming.push({
        id: 'P' + i,
        title: 'Deal ' + i,
        price: 100 - i,
        score: i,
        url: 'https://example.test/p/' + i,
      });
    }
    writeIn(incoming);

    const first = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    assert.equal(first.skipped, false);
    assert.equal(first.liveLength, 10, 'fail-when: free live exceeds 10');
    assert.equal(first.inGone, true);
    assert.equal(fs.existsSync(path.join(widgetDir(), 'in.json')), false);
    const inDir = path.join(widgetDir(), IN_DIR_NAME);
    const readyLeft = fs.existsSync(inDir)
      ? fs.readdirSync(inDir).filter((n) => n.endsWith('.json'))
      : [];
    assert.deepEqual(readyLeft, []);
    const processing = path.join(inDir, '.processing');
    if (fs.existsSync(processing)) {
      assert.deepEqual(fs.readdirSync(processing), []);
    }

    const livePath = path.join(widgetDir(), 'live.json');
    const afterFirst = readLiveArray(livePath);
    assert.equal(afterFirst.length, 10);
    // Highest scores kept: P24..P15
    assert.equal(afterFirst[0].partNumber, 'P24');

    const second = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, 'no_in');
    assert.deepEqual(readLiveArray(livePath), afterFirst);
  });

  it('exclude[] skips matching parts before cap', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    fs.writeFileSync(
      path.join(widgetDir(), 'searches.json'),
      `${JSON.stringify(
        {
          queries: [],
          exclude: [{ partId: 'BAD', reason: 'owner' }],
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    writeIn([
      { id: 'BAD', title: 'No', price: 1, score: 99 },
      { id: 'OK', title: 'Yes', price: 2, score: 1 },
    ]);
    const r = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    const live = readLiveArray(path.join(widgetDir(), 'live.json'));
    assert.equal(r.liveLength, 1);
    assert.equal(live[0].partNumber, 'OK');
    assert.equal(
      live.some((p) => p.partNumber === 'BAD'),
      false,
    );
  });

  it('fullTier upgraded+fullscreen keeps up to 25 of 25', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'fullscreen',
    });
    const incoming = [];
    for (let i = 0; i < 25; i++) {
      incoming.push({ id: 'F' + i, title: 'F' + i, price: i, score: 1 });
    }
    writeIn(incoming);
    const r = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: true,
      layout: 'fullscreen',
    });
    assert.equal(r.fullTier, true);
    assert.equal(r.liveCap, 500);
    assert.equal(r.liveLength, 25);
  });

  it('docs/fr/FR-206.md Decision LOCKED ASCII (FR-3344 IN/)', () => {
    const p = path.join(__dirname, '..', 'docs', 'fr', 'FR-206.md');
    const buf = fs.readFileSync(p);
    assert.notEqual(buf[0], 0xef);
    for (const b of buf) assert.ok(b < 128, 'FR-206.md must be ASCII');
    const text = buf.toString('utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /IN\/\.processing/);
    assert.match(text, /LIVE_PART_CAP_FREE|live part cap/i);
    assert.match(text, /exclude/);
    assert.match(text, /widgetGuid/);
    assert.match(text, /FR-3344/);
  });
});
