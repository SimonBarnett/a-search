'use strict';

/**
 * FR-170 / #1017: enable etsy only; FR-138 secret wiring; others stay dark.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

const STILL_DARK = [
  'kelkoo',
  'skimlinks',
  'aliexpress',
  'bol',
  'partnerize',
  'webgains',
  'tradedoubler',
  'admitad',
  'flexoffers',
  'avantlink',
  'shopify',
  'wix',
  'woocommerce',
];

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  const text = buf.toString('utf8');
  for (let i = 0; i < text.length; i += 1) {
    assert.ok(
      text.charCodeAt(i) < 128,
      `${rel} non-ASCII at ${i}: U+${text.charCodeAt(i).toString(16)}`,
    );
  }
  return text;
}

describe('FR-170 enable etsy', () => {
  it('registry enables etsy both envs; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const et = byId.get('etsy');
    assert.ok(et, 'registry missing etsy');
    assert.equal(et.enabled.live, true);
    assert.equal(et.enabled.sandbox, true);
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps etsy; FR-170 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\betsy\s*:/);
    assert.match(keysBlock[0], /ETSY_API_KEY/);
    assert.match(text, /ETSY_TRACKING_ID:\s*'a-search'/);
    const fr = utf8NoBom('docs/fr/FR-170.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /etsy/);
    assert.match(fr, /ETSY_API_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /etsy/i);
    assert.match(matrix, /ETSY_API_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\betsy\b/i,
    );
  });

  it('synth: etsy live+sandbox workers+queues; secret refs; dark ids absent', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr170');
    fs.rmSync(outdir, { recursive: true, force: true });
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();
    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing template');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};
    const fns = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::Lambda::Function',
    );
    const queues = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::SQS::Queue',
    );

    function envOf(name) {
      const fn = fns.find(
        (res) => res.Properties && res.Properties.FunctionName === name,
      );
      assert.ok(fn, `missing Lambda ${name}`);
      return fn.Properties.Environment.Variables || {};
    }

    for (const env of ['live', 'sandbox']) {
      const envVars = envOf(`a-search-etsy-worker-${env}`);
      assert.ok(envVars.ETSY_API_KEY, `missing API key ${env}`);
      const keyVal = String(envVars.ETSY_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.ETSY_API_KEY === 'object',
        `ETSY_API_KEY must be Secrets Manager ref (${env})`,
      );
      assert.equal(envVars.ETSY_TRACKING_ID, 'a-search');
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-etsy-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-etsy-${env}`);
    }

    for (const dark of ['kelkoo', 'skimlinks', 'aliexpress', 'partnerize']) {
      const hit = fns.find(
        (res) =>
          res.Properties &&
          typeof res.Properties.FunctionName === 'string' &&
          res.Properties.FunctionName.includes(`-${dark}-worker-`),
      );
      assert.equal(hit, undefined, `stay-dark ${dark} must not have worker`);
    }
  });
});
