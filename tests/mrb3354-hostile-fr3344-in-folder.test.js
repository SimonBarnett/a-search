'use strict';

/**
 * MRB #3354 hostile pins for FR-3344 / PR #3354 (IN/ folder replaces in.json).
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bootstrapWidget } = require('../shared/widgets/bootstrap');
const {
  IN_DIR_NAME,
  writeInSearchFile,
  listReadyInFiles,
  runIngestPass,
} = require('../shared/widgets/agentIngest');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'shared', 'widgets', 'agentIngest.js'), 'utf8');

describe('mrb3354 hostile FR-3344 IN/ folder', () => {
  let root;
  const env = 'sandbox';
  const customerNumber = '42';
  const host = 'shop.mrb3354.test';
  const widgetGuid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrb3354-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function widgetDir() {
    return path.join(root, env, 'x', customerNumber, widgetGuid);
  }

  function baseOpts(extra) {
    return Object.assign({ root, env, customerNumber, widgetGuid }, extra || {});
  }

  it('source never writes legacy in.json; IN_DIR_NAME is IN', () => {
    assert.equal(IN_DIR_NAME, 'IN');
    assert.doesNotMatch(SRC, /writeFileSync\([^)]*in\.json/);
    assert.match(SRC, /IN_DIR_NAME\s*=\s*['"]IN['"]/);
    assert.match(SRC, /IN_PROCESSING_DIR_NAME\s*=\s*['"]\.processing['"]/);
    assert.match(SRC, /function writeInSearchFile/);
    assert.match(SRC, /function listReadyInFiles/);
  });

  it('listReadyInFiles skips .processing and non-json; write path is IN/{searchId}.json', () => {
    bootstrapWidget({ root, env, customerNumber, widgetGuid, host, layout: 'horizontal' });
    const abs = writeInSearchFile(
      baseOpts({
        searchId: 's-ready',
        parts: [{ id: 'p1', title: 't', price: 1, score: 1 }],
      }),
    );
    assert.ok(abs.replace(/\\/g, '/').endsWith('/IN/s-ready.json'));

    const inDir = path.join(widgetDir(), 'IN');
    const processing = path.join(inDir, '.processing');
    fs.mkdirSync(processing, { recursive: true });
    fs.writeFileSync(path.join(processing, 'ghost.json'), '{}');
    fs.writeFileSync(path.join(inDir, 'note.txt'), 'nope');

    const ready = listReadyInFiles(baseOpts());
    assert.deepEqual(
      ready.map((p) => path.basename(p)).sort(),
      ['s-ready.json'],
    );
  });

  it('runIngestPass clears IN/*.json and .processing after success; no in.json', () => {
    bootstrapWidget({ root, env, customerNumber, widgetGuid, host, layout: 'horizontal' });
    writeInSearchFile(
      baseOpts({
        searchId: 's1',
        parts: [{ id: 'a', title: 'A', price: 2, score: 1 }],
      }),
    );
    const result = runIngestPass(baseOpts({}));
    assert.ok(result);
    const inDir = path.join(widgetDir(), 'IN');
    const readyLeft = fs.existsSync(inDir)
      ? fs.readdirSync(inDir).filter((n) => n.endsWith('.json'))
      : [];
    assert.deepEqual(readyLeft, []);
    const processing = path.join(inDir, '.processing');
    if (fs.existsSync(processing)) {
      assert.deepEqual(fs.readdirSync(processing), []);
    }
    assert.equal(fs.existsSync(path.join(widgetDir(), 'in.json')), false);
  });
});
