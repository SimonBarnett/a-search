'use strict';

/**
 * FR #4560: CDK Code.fromAsset default IgnoreMode.GIT strips gitignored `.env`
 * from staged worker assets, so rakuten/cj/kelkoo Lambdas ship without credentials.
 * Amazon/ebay/etsy still got keys via wireProviderEnvFromFile; bundle-only providers
 * did not. Fix: IgnoreMode.DOCKER (no .dockerignore) + assert required key names
 * before deploy (never print values).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');
const {
  assertProviderEnvFileKeys,
  requiredBundledEnvKeys,
} = require('../cdk/lib/provider-env-assert');

describe('FR #4560 bundled .env survives CDK asset pack', () => {
  it('worker fromAsset uses IgnoreMode.DOCKER so gitignored .env is not stripped', () => {
    const src = fs.readFileSync(STACK, 'utf8');
    assert.match(src, /IgnoreMode\.DOCKER/);
    assert.match(src, /function workerLambdaCodeAssetOptions/);
    assert.match(
      src,
      /Code\.fromAsset\(\s*workerAssetDir\s*,\s*workerLambdaCodeAssetOptions\(\)/,
    );
    assert.match(src, /assertProviderEnvFileKeys\(envFile,\s*src\.id\)/);
  });

  it('requiredBundledEnvKeys covers rakuten, cj, kelkoo search secrets', () => {
    assert.deepEqual(requiredBundledEnvKeys('rakuten').sort(), [
      'RAKUTEN_CLIENT_ID',
      'RAKUTEN_CLIENT_SECRET',
      'RAKUTEN_SID',
    ].sort());
    assert.ok(requiredBundledEnvKeys('cj').includes('CJ_API_TOKEN'));
    assert.ok(requiredBundledEnvKeys('kelkoo').includes('KELKOO_API_KEY'));
  });

  it('assertProviderEnvFileKeys names missing keys and never a value', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4560-keys-'));
    const envFile = path.join(dir, '.env');
    const sentinel = 'FAKE_MUST_NOT_LEAK';
    fs.writeFileSync(
      envFile,
      `RAKUTEN_CLIENT_ID=${sentinel}\nRAKUTEN_CLIENT_SECRET=\n`,
      'utf8',
    );
    assert.throws(
      () =>
        assertProviderEnvFileKeys(envFile, 'rakuten', [
          'RAKUTEN_CLIENT_ID',
          'RAKUTEN_CLIENT_SECRET',
          'RAKUTEN_SID',
        ]),
      (err) => {
        const message = String(err && err.message);
        assert.match(message, /RAKUTEN_CLIENT_SECRET/);
        assert.match(message, /RAKUTEN_SID/);
        assert.equal(message.includes(sentinel), false);
        return true;
      },
    );
  });

  it('stage copies .env and records bundledEnv in asset meta', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4560-stage-'));
    const srcDir = path.join(root, 'providers', 'live', 'rakuten', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'worker.js'), "'use strict';\n", 'utf8');
    for (const f of [
      'shared/intake/reportException.js',
      'shared/intake/redact.js',
      'shared/assertEnv.js',
      'shared/writeResults.js',
    ]) {
      const p = path.join(root, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, '', 'utf8');
    }
    fs.mkdirSync(path.join(root, 'worker', 'lib'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'worker', 'lib', 'normalizeProduct.js'),
      '',
      'utf8',
    );
    fs.mkdirSync(
      path.join(root, 'node_modules', '@aws', 'lambda-invoke-store'),
      { recursive: true },
    );
    fs.writeFileSync(
      path.join(
        root,
        'node_modules',
        '@aws',
        'lambda-invoke-store',
        'package.json',
      ),
      '{}\n',
      'utf8',
    );
    const envFile = path.join(root, 'rakuten.env');
    fs.writeFileSync(
      envFile,
      'RAKUTEN_CLIENT_ID=FAKE_ID\nRAKUTEN_CLIENT_SECRET=FAKE_SEC\nRAKUTEN_SID=FAKE_SID\n',
      'utf8',
    );
    const out = stageProviderWorkerLambdaAsset(
      root,
      { id: 'rakuten', folder: 'providers/live/rakuten' },
      { envFile, outDir: path.join(root, 'out') },
    );
    assert.ok(
      fs.existsSync(path.join(out, 'providers', 'live', 'rakuten', '.env')),
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(out, '.a-search-worker-asset.json'), 'utf8'),
    );
    assert.equal(meta.bundledEnv, true);
  });
});
