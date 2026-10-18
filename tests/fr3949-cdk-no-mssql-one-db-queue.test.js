'use strict';

/**
 * FR #3949: CDK strip MSSQL Lambdas; one DB-backed SQS + walrus IAM.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-3949 CDK no MSSQL Lambdas / one DB-backed queue', () => {
  it('stack source: no wireMssqlSecretEnv calls; one db-backed queue + walrus IAM', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.doesNotMatch(text, /\bwireMssqlSecretEnv\s*\(/);
    assert.doesNotMatch(text, /MssqlConnSecret/);
    assert.doesNotMatch(text, /MssqlSecretArn/);
    assert.doesNotMatch(text, /mssqlAppSecretArn|mssqlSecretArn/);
    assert.match(text, /FR-3949|DbBacked|db-backed|walrus/i);
    assert.match(text, /WalrusConsumer|walrusConsumer/i);
    assert.match(text, /DbBacked.*Queue|dbBackedQueue/i);
  });

  it('synth: no MSSQL env on Lambdas; exactly one db-backed search queue pair', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');
    const { outDir } = ensureDefaultStackSynth(root);
    const templatePath = path.join(outDir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing template');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};
    const resourceCount = Object.keys(resources).length;
    assert.ok(resourceCount < 500, `CFN resources ${resourceCount} must stay under 500`);

    for (const [id, res] of Object.entries(resources)) {
      if (!res || res.Type !== 'AWS::Lambda::Function') continue;
      const env = (res.Properties && res.Properties.Environment && res.Properties.Environment.Variables) || {};
      for (const key of Object.keys(env)) {
        assert.doesNotMatch(
          key,
          /^MSSQL_|^MADEIRADB_DATABASE$/,
          `${id} must not have ${key}`,
        );
      }
      assert.ok(!res.Properties.VpcConfig, `${id} must not set VpcConfig`);
    }

    const secretLogical = Object.values(resources).filter(
      (r) => r && r.Type === 'AWS::SecretsManager::Secret',
    );
    for (const s of secretLogical) {
      const name = JSON.stringify(s.Properties || {});
      assert.doesNotMatch(name, /mssql/i, 'no MSSQL secret resource');
    }
    assert.ok(
      !JSON.stringify(tpl.Outputs || {}).includes('MssqlSecretArn'),
      'no MssqlSecretArn output',
    );

    const queues = Object.entries(resources).filter(
      ([, r]) => r && r.Type === 'AWS::SQS::Queue',
    );
    const dbQueues = queues.filter(([, r]) => {
      const qn = String((r.Properties && r.Properties.QueueName) || '');
      return /db-backed|db_backed|DbBacked/i.test(qn);
    });
    assert.equal(dbQueues.length, 2, 'exactly one db-backed queue + its DLQ');
    const primary = dbQueues.find(([, r]) => {
      const qn = String((r.Properties && r.Properties.QueueName) || '');
      return !/-dlq$/i.test(qn);
    });
    const dlq = dbQueues.find(([, r]) => {
      const qn = String((r.Properties && r.Properties.QueueName) || '');
      return /-dlq$/i.test(qn);
    });
    assert.ok(primary, 'db-backed primary queue');
    assert.ok(dlq, 'db-backed DLQ');
    assert.ok(
      primary[1].Properties.RedrivePolicy,
      'db-backed queue has RedrivePolicy',
    );

    // Per-source local queues must be gone (merchant/affiliate SQL workers).
    for (const id of [
      'awin',
      'impact',
      'partnerize',
      'webgains',
      'tradedoubler',
      'shopify',
      'wix',
      'woocommerce',
    ]) {
      for (const env of ['live', 'sandbox']) {
        const want = `a-search-${id}-${env}`;
        const hit = queues.find(([, r]) => {
          const qn = String((r.Properties && r.Properties.QueueName) || '');
          return qn === want || qn.endsWith(want);
        });
        assert.equal(hit, undefined, `local queue ${want} must be removed`);
      }
    }

    const iamUsers = Object.values(resources).filter(
      (r) => r && r.Type === 'AWS::IAM::User',
    );
    assert.ok(
      iamUsers.some((u) =>
        /walrus/i.test(JSON.stringify(u.Properties || {})),
      ),
      'walrus consumer IAM user',
    );
  });
});
