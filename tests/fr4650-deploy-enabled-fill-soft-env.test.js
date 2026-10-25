'use strict';

/**
 * FR #4650: missing credentials => provider off (no fan-out); fill-madeira never
 * throws on missing /madeira/*; one deploy warning lists disabled providers.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  fillMadeiraProviderEnv,
  formatDisabledProvidersWarning,
} = require('../cdk/lib/fill-madeira-ssm-env');
const {
  softCheckProviderEnvFileKeys,
  assertProviderEnvFileKeys,
} = require('../cdk/lib/provider-env-assert');
const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');

const ROOT = path.join(__dirname, '..');

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
    const { written, disabled } = fillMadeiraProviderEnv({
      repoRoot: root,
      enabledSourceIds: ['amazon', 'ebay'],
      getParameter: (name) => {
        asked.push(name);
        return AMAZON_EBAY[name] || '';
      },
    });
    assert.equal(written.length, 2);
    assert.equal(disabled.length, 0);
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

  it('fill-madeira missing etsy SSM does not throw; reports disabled', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-etsy-off-'));
    const { written, disabled } = fillMadeiraProviderEnv({
      repoRoot: root,
      enabledSourceIds: ['amazon', 'ebay', 'etsy'],
      getParameter: (name) => AMAZON_EBAY[name] || '',
    });
    assert.equal(written.length, 2);
    assert.equal(disabled.length, 1);
    assert.equal(disabled[0].id, 'etsy');
    assert.ok(disabled[0].missingKeys.includes('/madeira/etsy/api-key'));
    assert.equal(
      fs.existsSync(path.join(root, 'providers', 'live', 'etsy', '.env')),
      false,
    );
    const warn = formatDisabledProvidersWarning(disabled);
    assert.match(warn, /providers disabled \(missing credentials\)/);
    assert.match(warn, /etsy: missing \/madeira\/etsy\/api-key/);
  });

  it('softCheckProviderEnvFileKeys allows missing kelkoo .env without leaking values', () => {
    const missing = path.join(
      os.tmpdir(),
      `fr4650-no-kelkoo-${process.pid}.env`,
    );
    const sentinel = 'FAKE_MUST_NOT_LEAK';
    const check = softCheckProviderEnvFileKeys(missing, 'kelkoo');
    assert.equal(check.ok, false);
    assert.ok(check.missingKeys.includes('KELKOO_API_KEY'));
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

  it('stack omits fan-out when env not ready and warns once with key names', () => {
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /softCheckProviderEnvFileKeys/);
    assert.match(
      stack,
      /envFile:\s*envReady\s*\?\s*envFile\s*:\s*undefined/,
    );
    assert.match(stack, /if \(envReady\) \{\s*const urlKey = queueUrlEnvKey/);
    assert.match(
      stack,
      /providers disabled \(missing credentials\)/,
    );
  });

  it('resolveFanOutTargets skips providers with no queue URL when envVars set', () => {
    const { resolveFanOutTargets } = require('../entry/src/agentSearch');
    const targets = resolveFanOutTargets('live', {
      envVars: {
        SQS_AMAZON_LIVE_URL: 'https://sqs.example/amazon.fifo',
        SQS_EBAY_LIVE_URL: 'https://sqs.example/ebay.fifo',
        SQS_RAKUTEN_LIVE_URL: 'https://sqs.example/rakuten.fifo',
        SQS_CJ_LIVE_URL: 'https://sqs.example/cj.fifo',
        SQS_DB_BACKED_LIVE_URL: 'https://sqs.example/db',
        // no Kelkoo / Etsy URLs
      },
    });
    assert.ok(targets.includes('amazon'));
    assert.ok(targets.includes('sql'));
    assert.equal(targets.includes('kelkoo'), false);
    assert.equal(targets.includes('etsy'), false);
  });

  it('synth without kelkoo/etsy credentials succeeds and entry has no fan-out URLs', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch {
      return;
    }
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-env-'));
    for (const id of ['amazon', 'ebay', 'rakuten', 'cj']) {
      const src = path.join(ROOT, 'tests', 'fixtures', 'provider-env', `${id}.env`);
      fs.copyFileSync(src, path.join(envRoot, `${id}.env`));
    }
    // no kelkoo.env / etsy.env
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4650-cdk-'));
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => {
      warns.push(args.map(String).join(' '));
    };
    try {
      const app = new cdk.App({
        outdir: outDir,
        context: {
          account: '123456789012',
          region: 'eu-west-2',
          providerEnvRoot: envRoot,
        },
      });
      new ASearchStack(app, 'ASearchStack');
      app.synth();
    } finally {
      console.warn = origWarn;
    }
    const templatePath = path.join(outDir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth wrote template');
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const entry = Object.values(template.Resources || {}).find(
      (r) =>
        r &&
        r.Type === 'AWS::Lambda::Function' &&
        r.Properties &&
        r.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'entry Lambda present');
    const env = (entry.Properties.Environment || {}).Variables || {};
    assert.equal(env.SQS_KELKOO_LIVE_URL, undefined);
    assert.equal(env.SQS_KELKOO_SANDBOX_URL, undefined);
    assert.equal(env.SQS_ETSY_LIVE_URL, undefined);
    assert.equal(env.SQS_ETSY_SANDBOX_URL, undefined);
    assert.ok(env.SQS_AMAZON_LIVE_URL || env.SQS_AMAZON_SANDBOX_URL);
    // Resources kept (DLQ) even when fan-out omitted.
    const queues = Object.values(template.Resources || {})
      .filter((r) => r && r.Type === 'AWS::SQS::Queue')
      .map((r) => r.Properties && r.Properties.QueueName);
    assert.ok(queues.some((q) => String(q).includes('kelkoo')));
    const joined = warns.join('\n');
    assert.match(joined, /providers disabled \(missing credentials\)/);
    // FR #5058: softCheck message names missing file + Required keys (not only
    // "kelkoo: missing KEY").
    assert.match(joined, /kelkoo:.*KELKOO_API_KEY/);
    assert.match(joined, /kelkoo:.*missing file/);
    assert.match(joined, /etsy:.*ETSY_API_KEY/);
    assert.match(joined, /etsy:.*missing file/);
    assert.equal(joined.includes('FAKE_'), false);
  });
});
