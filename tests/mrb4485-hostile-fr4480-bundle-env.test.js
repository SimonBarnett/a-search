'use strict';

/**
 * MRB #4485 hostile pins for FR #4480 (product PR #4485).
 * Bundle live provider .env into Lambda assets; Rakuten stays on AWS with
 * CLIENT_ID/CLIENT_SECRET/SID; no secret values in missing-file errors.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');
const { resolveFanOutTargets } = require('../entry/src/agentSearch');

const ROOT = path.join(__dirname, '..');

describe('MRB #4485 hostile FR #4480 bundle provider env', () => {
  it('stage copies .env beside provider src; missing file names path only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mrb4485-stage-'));
    const srcDir = path.join(root, 'providers', 'live', 'cj', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'worker.js'), "'use strict';\n", 'utf8');
    fs.mkdirSync(path.join(root, 'shared', 'intake'), { recursive: true });
    for (const rel of [
      'shared/intake/reportException.js',
      'shared/intake/redact.js',
      'shared/assertEnv.js',
      'shared/writeResults.js',
    ]) {
      fs.writeFileSync(path.join(root, rel), '', 'utf8');
    }
    fs.mkdirSync(path.join(root, 'worker', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'worker', 'lib', 'normalizeProduct.js'), '', 'utf8');
    fs.mkdirSync(path.join(root, 'node_modules', '@aws', 'lambda-invoke-store'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, 'node_modules', '@aws', 'lambda-invoke-store', 'package.json'),
      '{}\n',
      'utf8',
    );
    const sentinel = 'FAKE_MRB4485_SECRET';
    const envFile = path.join(root, 'cj.env');
    fs.writeFileSync(envFile, `CJ_API_TOKEN=${sentinel}\n`, 'utf8');
    const out = stageProviderWorkerLambdaAsset(
      root,
      { id: 'cj', folder: 'providers/live/cj' },
      { envFile, outDir: path.join(root, 'out') },
    );
    assert.match(
      fs.readFileSync(path.join(out, 'providers', 'live', 'cj', '.env'), 'utf8'),
      new RegExp(sentinel),
    );
    assert.throws(
      () =>
        stageProviderWorkerLambdaAsset(
          root,
          { id: 'cj', folder: 'providers/live/cj' },
          { envFile: path.join(root, 'missing.env'), outDir: path.join(root, 'out2') },
        ),
      (err) => {
        const msg = String(err && err.message);
        assert.match(msg, /missing file/);
        assert.match(msg, /missing\.env/);
        assert.equal(msg.includes(sentinel), false);
        return true;
      },
    );
  });

  it('fan-out keeps amazon ebay rakuten cj kelkoo etsy plus sql', () => {
    const targets = resolveFanOutTargets('live');
    for (const id of ['amazon', 'ebay', 'rakuten', 'cj', 'kelkoo', 'etsy', 'sql']) {
      assert.ok(targets.includes(id), id);
    }
  });

  it('rakuten search uses CLIENT_ID SECRET SID not PRODUCT_SEARCH_TOKEN', () => {
    const search = fs.readFileSync(
      path.join(ROOT, 'providers', 'live', 'rakuten', 'src', 'search.js'),
      'utf8',
    );
    assert.match(search, /RAKUTEN_CLIENT_ID/);
    assert.match(search, /RAKUTEN_CLIENT_SECRET/);
    assert.match(search, /RAKUTEN_SID/);
    assert.doesNotMatch(search, /RAKUTEN_PRODUCT_SEARCH_TOKEN/);
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /envFile/);
    assert.match(stack, /FR #4480/);
    assert.match(stack, /RAKUTEN_CLIENT_ID/);
  });

  it('each live worker loads bundled env at most once', () => {
    const live = path.join(ROOT, 'providers', 'live');
    for (const id of fs.readdirSync(live)) {
      const worker = path.join(live, id, 'src', 'worker.js');
      if (!fs.existsSync(worker)) continue;
      const text = fs.readFileSync(worker, 'utf8');
      if (!text.includes('applyBundledProviderEnv')) continue;
      const hits = text.match(/applyBundledProviderEnv\(__dirname\)/g) || [];
      assert.equal(hits.length, 1, id);
    }
  });
});
