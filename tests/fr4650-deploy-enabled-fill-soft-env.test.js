'use strict';

/**
 * FR #4650: fill-madeira only for registry-enabled providers; missing bundled
 * .env must not fail synth (resources kept, fail-closed at run time).
 * Kelkoo has no /madeira SSM path --- operator .env or soft-deploy.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  fillMadeiraProviderEnv,
} = require('../cdk/lib/fill-madeira-ssm-env');
const {
  softCheckProviderEnvFileKeys,
  assertProviderEnvFileKeys,
} = require('../cdk/lib/provider-env-assert');
const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');

const AMAZON_EBAY = {
  '/madeira/amazon/access-key': 'FAKE_AK',
  '/madeira/amazon/secret-key': 'FAKE_SK',
  '/madeira/amazon/associate-tag': 'FAKE_TAG',
  '/madeira/amazon/host': 'webservices.amazon.co.uk',
  '/madeira/amazon/region': 'eu-west-1',
  '/madeira/ebay/client-id': 'FAKE_ID',
  '/madeira/ebay/client-secret': 'FAKE_ES',
  '/madeira/ebay/campaign-id': 'FAKE_CP',
  '/madeira/ebay/marketplace-id': 'EBAY_GB',
};

describe('FR #4650 deploy fill gated + soft missing env', () => {
  it('fill-madeira skips etsy when etsy is not registry-enabled', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-skip-etsy-'));
    const asked = [];
    const written = fillMadeiraProviderEnv({
      repoRoot: root,
      enabledSourceIds: ['amazon', 'ebay'],
      getParameter: (name) => {
        asked.push(name);
        return AMAZON_EBAY[name] || '';
      },
    });
    assert.equal(written.length, 2);
    assert.equal(
      asked.some((n) => n.startsWith('/madeira/etsy/')),
      false,
      'must not ask etsy SSM when etsy disabled',
    );
    assert.ok(
      fs.existsSync(path.join(root, 'providers', 'live', 'amazon', '.env')),
    );
    assert.equal(
      fs.existsSync(path.join(root, 'providers', 'live', 'etsy', '.env')),
      false,
    );
  });

  it('fill-madeira still requires etsy SSM when etsy is enabled', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-etsy-on-'));
    assert.throws(
      () =>
        fillMadeiraProviderEnv({
          repoRoot: root,
          enabledSourceIds: ['amazon', 'ebay', 'etsy'],
          getParameter: (name) => AMAZON_EBAY[name] || '',
        }),
      /missing SSM parameter \/madeira\/etsy\/api-key/,
    );
  });

  it('softCheckProviderEnvFileKeys allows missing kelkoo .env without leaking values', () => {
    const missing = path.join(
      os.tmpdir(),
      `fr4650-no-kelkoo-${process.pid}.env`,
    );
    const sentinel = 'FAKE_MUST_NOT_LEAK';
    const check = softCheckProviderEnvFileKeys(missing, 'kelkoo');
    assert.equal(check.ok, false);
    assert.match(check.message, /kelkoo/);
    assert.equal(check.message.includes(sentinel), false);
    assert.throws(
      () => assertProviderEnvFileKeys(missing, 'kelkoo'),
      /missing file/,
    );
  });

  it('stage without envFile still builds the worker asset (fail-closed bundle)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-stage-'));
    const srcDir = path.join(root, 'providers', 'live', 'kelkoo', 'src');
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
    const out = stageProviderWorkerLambdaAsset(
      root,
      { id: 'kelkoo', folder: 'providers/live/kelkoo' },
      { outDir: path.join(root, 'out') },
    );
    assert.ok(fs.existsSync(path.join(out, 'providers', 'live', 'kelkoo', 'src', 'worker.js')));
    assert.equal(
      fs.existsSync(path.join(out, 'providers', 'live', 'kelkoo', '.env')),
      false,
    );
    const meta = JSON.parse(
      fs.readFileSync(path.join(out, '.a-search-worker-asset.json'), 'utf8'),
    );
    assert.equal(meta.bundledEnv, false);
  });

  it('stack soft-checks provider env and stages only when keys present', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /softCheckProviderEnvFileKeys/);
    assert.match(
      stack,
      /envFile:\s*envReady\s*\?\s*envFile\s*:\s*undefined/,
    );
  });
});
