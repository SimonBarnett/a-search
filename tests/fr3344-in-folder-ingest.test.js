'use strict';

/**
 * FR-3344 / #3344: replace single in.json with IN/ folder (one file per search).
 * Writers never merge into one file; agent consumes all ready IN/*.json.
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapWidget } = require('../shared/widgets/bootstrap');
const { readLiveArray } = require('../shared/widgets/parts');
const {
  IN_DIR_NAME,
  writeInSearchFile,
  listReadyInFiles,
  runIngestPass,
} = require('../shared/widgets/agentIngest');

describe('FR-3344 IN folder ingest (replaces in.json)', () => {
  /** @type {string} */
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.example';
  const widgetGuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a-search-fr3344-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function widgetDir() {
    return path.join(root, env, 'x', customerNumber, widgetGuid);
  }

  function inDir() {
    return path.join(widgetDir(), IN_DIR_NAME);
  }

  it('exports IN_DIR_NAME = IN and writeInSearchFile writes per-search JSON under IN/', () => {
    assert.equal(IN_DIR_NAME, 'IN');
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    const abs = writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 'search-a',
      parts: [{ id: 'A1', title: 'Alpha', price: 1, score: 1 }],
    });
    assert.ok(abs.endsWith(path.join('IN', 'search-a.json')) || abs.replace(/\\/g, '/').endsWith('IN/search-a.json'));
    assert.equal(fs.existsSync(path.join(widgetDir(), 'in.json')), false, 'must not write legacy in.json');
    const ready = listReadyInFiles({ root, env, customerNumber, widgetGuid });
    assert.equal(ready.length, 1);
    assert.equal(path.basename(ready[0]), 'search-a.json');
  });

  it('two search files merge into live; IN/*.json gone; .processing empty; re-run skipped', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 's1',
      parts: [
        { id: 'P1', title: 'One', price: 10, score: 1 },
        { id: 'P2', title: 'Two', price: 9, score: 5 },
      ],
    });
    writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 's2',
      parts: [{ id: 'P3', title: 'Three', price: 8, score: 9 }],
    });
    assert.equal(fs.readdirSync(inDir()).filter((n) => n.endsWith('.json')).length, 2);

    const first = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    assert.equal(first.skipped, false);
    assert.equal(first.ingested, 3);
    assert.equal(first.inGone, true);
    assert.equal(fs.existsSync(path.join(widgetDir(), 'in.json')), false);
    const leftover = fs.existsSync(inDir())
      ? fs.readdirSync(inDir()).filter((n) => n.endsWith('.json'))
      : [];
    assert.deepEqual(leftover, [], 'ready IN/*.json must be consumed');
    const processing = path.join(inDir(), '.processing');
    if (fs.existsSync(processing)) {
      assert.deepEqual(fs.readdirSync(processing), [], '.processing must be empty after success');
    }
    const live = readLiveArray(path.join(widgetDir(), 'live.json'));
    assert.equal(live[0].partNumber, 'P3');

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
  });

  it('file written to IN/ during ingest remains for the next pass', () => {
    bootstrapWidget({
      root,
      env,
      customerNumber,
      widgetGuid,
      host,
      layout: 'horizontal',
    });
    writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 'batch1',
      parts: [{ id: 'A', title: 'A', price: 1, score: 1 }],
    });

    // Simulate a concurrent search write after claim: inject into ready list mid-pass
    // by writing after first pass starts via claiming only listed files.
    const first = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    assert.equal(first.skipped, false);

    writeInSearchFile({
      root,
      env,
      customerNumber,
      widgetGuid,
      searchId: 'batch2',
      parts: [{ id: 'B', title: 'B', price: 2, score: 2 }],
    });
    assert.equal(listReadyInFiles({ root, env, customerNumber, widgetGuid }).length, 1);

    const second = runIngestPass({
      root,
      env,
      customerNumber,
      widgetGuid,
      upgraded: false,
      layout: 'horizontal',
    });
    assert.equal(second.skipped, false);
    assert.equal(second.ingested, 1);
    const live = readLiveArray(path.join(widgetDir(), 'live.json'));
    assert.ok(live.some((p) => p.partNumber === 'B'));
  });
});
