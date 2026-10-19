'use strict';

/**
 * FR #4480: bundle each live provider .env into its Lambda asset,
 * fail deploy when the file is missing, and keep Rakuten on the AWS fan-out.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  stageProviderWorkerLambdaAsset,
} = require('../scripts/stage-provider-worker-lambda-asset');
const { applyBundledProviderEnv } = require('../shared/loadBundledProviderEnv');
const {
  fillMadeiraProviderEnv,
} = require('../cdk/lib/fill-madeira-ssm-env');
const { resolveFanOutTargets } = require('../entry/src/agentSearch');

describe('FR #4480 bundle provider env', () => {
  it('copies .env into the provider asset and does not echo a value', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4480-stage-'));
    const srcDir = path.join(root, 'providers', 'live', 'rakuten', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'worker.js'), "'use strict';\n", 'utf8');
    fs.mkdirSync(path.join(root, 'shared', 'intake'), { recursive: true });
    fs.writeFileSync(path.join(root, 'shared', 'intake', 'reportException.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'shared', 'intake', 'redact.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'shared', 'assertEnv.js'), '', 'utf8');
    fs.writeFileSync(path.join(root, 'shared', 'writeResults.js'), '', 'utf8');
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
    const sentinel = 'FAKE_BUNDLE_SENTINEL';
    const envFile = path.join(root, 'rakuten.env');
    fs.writeFileSync(envFile, `RAKUTEN_CLIENT_ID=${sentinel}\n`, 'utf8');
    const out = stageProviderWorkerLambdaAsset(
      root,
      { id: 'rakuten', folder: 'providers/live/rakuten' },
      { envFile, outDir: path.join(root, 'out') },
    );
    const bundled = fs.readFileSync(
      path.join(out, 'providers', 'live', 'rakuten', '.env'),
      'utf8',
    );
    assert.match(bundled, /RAKUTEN_CLIENT_ID=/);
    assert.match(bundled, new RegExp(sentinel));
  });

  it('missing env file fails and the message has no secret value', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4480-miss-'));
    const srcDir = path.join(root, 'providers', 'live', 'cj', 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'worker.js'), "'use strict';\n", 'utf8');
    const missing = path.join(root, 'does-not-exist.env');
    const sentinel = 'FAKE_SHOULD_NOT_APPEAR';
    assert.throws(
      () =>
        stageProviderWorkerLambdaAsset(
          root,
          { id: 'cj', folder: 'providers/live/cj' },
          { envFile: missing, outDir: path.join(root, 'out') },
        ),
      (err) => {
        const message = String(err && err.message);
        assert.match(message, /missing file/);
        assert.match(message, /does-not-exist\.env/);
        assert.equal(message.includes(sentinel), false);
        return true;
      },
    );
  });

  it('loads a bundled .env without replacing an existing key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4480-load-'));
    const src = path.join(dir, 'src');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.env'),
      'RAKUTEN_SID=FAKE_FROM_FILE\nRAKUTEN_CLIENT_ID=FAKE_FILE_ID\n',
      'utf8',
    );
    const target = { RAKUTEN_CLIENT_ID: 'FAKE_ALREADY' };
    const applied = applyBundledProviderEnv(src, target);
    assert.deepEqual(applied, ['RAKUTEN_SID']);
    assert.equal(target.RAKUTEN_CLIENT_ID, 'FAKE_ALREADY');
    assert.equal(target.RAKUTEN_SID, 'FAKE_FROM_FILE');
  });

  it('SSM fill writes amazon and ebay env files and names a missing parameter', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr4480-ssm-'));
    const values = {
      '/madeira/amazon/AMAZON_ACCESS_KEY': 'FAKE_AK',
      '/madeira/amazon/AMAZON_SECRET_KEY': 'FAKE_SK',
      '/madeira/amazon/AMAZON_PARTNER_TAG': 'FAKE_PT',
      '/madeira/amazon/AMAZON_HOST': 'webservices.amazon.co.uk',
      '/madeira/amazon/AMAZON_REGION': 'eu-west-1',
      '/madeira/ebay/EBAY_CLIENT_ID': 'FAKE_ID',
      '/madeira/ebay/EBAY_CLIENT_SECRET': 'FAKE_ES',
      '/madeira/ebay/EBAY_CAMPAIGN_ID': 'FAKE_CP',
      '/madeira/ebay/EBAY_MARKETPLACE_ID': 'EBAY_GB',
    };
    const written = fillMadeiraProviderEnv({
      repoRoot: root,
      getParameter: (name) => values[name] || '',
    });
    assert.equal(written.length, 2);
    const amazon = fs.readFileSync(
      path.join(root, 'providers', 'live', 'amazon', '.env'),
      'utf8',
    );
    assert.match(amazon, /AMAZON_ACCESS_KEY=FAKE_AK/);
    assert.throws(
      () =>
        fillMadeiraProviderEnv({
          repoRoot: root,
          getParameter: () => '',
        }),
      (err) => {
        const message = String(err && err.message);
        assert.match(message, /missing SSM parameter \/madeira\/amazon\/AMAZON_ACCESS_KEY/);
        assert.equal(message.includes('FAKE_AK'), false);
        return true;
      },
    );
  });

  it('synth keeps the rakuten worker and creates no provider secret', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      return;
    }
    const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');
    const root = path.join(__dirname, '..');
    const { outDir } = ensureDefaultStackSynth(root, { fresh: true, cacheKey: 'fr4480' });
    const tpl = JSON.parse(
      fs.readFileSync(path.join(outDir, 'ASearchStack.template.json'), 'utf8'),
    );
    const resources = tpl.Resources || {};
    const names = Object.values(resources)
      .filter((res) => res && res.Type === 'AWS::Lambda::Function')
      .map((res) => res.Properties && res.Properties.FunctionName);
    assert.ok(names.includes('a-search-rakuten-worker-live'));
    const queues = Object.values(resources)
      .filter((res) => res && res.Type === 'AWS::SQS::Queue')
      .map((res) => res.Properties && res.Properties.QueueName);
    assert.ok(
      queues.some((q) => String(q).includes('rakuten') && String(q).includes('live')),
    );
    const secrets = Object.entries(resources).filter(
      ([id, res]) =>
        res &&
        res.Type === 'AWS::SecretsManager::Secret' &&
        /provider/i.test(id),
    );
    assert.equal(secrets.length, 0);
    const rakutenFn = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-rakuten-worker-live',
    );
    const env = (rakutenFn.Properties.Environment || {}).Variables || {};
    assert.equal(env.RAKUTEN_CLIENT_SECRET, undefined);
    assert.equal(JSON.stringify(env).includes('FAKE_RAKUTEN'), false);
  });

  it('fan-out keeps rakuten and the other live search providers', () => {
    const targets = resolveFanOutTargets('live');
    for (const id of ['amazon', 'ebay', 'rakuten', 'cj', 'kelkoo', 'etsy', 'sql']) {
      assert.ok(targets.includes(id), id);
    }
    assert.equal(targets.includes('aliexpress'), false);
    assert.equal(targets.includes('bol'), false);
  });
});
