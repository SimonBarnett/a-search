'use strict';

/**
 * FR-169 / #1016: enable aliexpress only; FR-138 secret wiring; others stay dark.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

const STILL_DARK = [
  'skimlinks',
  'etsy',
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

describe('FR-169 enable aliexpress', () => {
  it('registry enables aliexpress both envs; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const ae = byId.get('aliexpress');
    assert.ok(ae, 'registry missing aliexpress');
    assert.equal(ae.enabled.live, true);
    assert.equal(ae.enabled.sandbox, true);
    const kk = byId.get('kelkoo');
    assert.ok(kk, 'kelkoo');
    assert.equal(kk.enabled.live, true, 'FR-167 kelkoo.live');
    assert.equal(kk.enabled.sandbox, true, 'FR-167 kelkoo.sandbox');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps aliexpress; FR-169 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\baliexpress\s*:/);
    assert.match(keysBlock[0], /ALIEXPRESS_API_KEY/);
    assert.match(text, /ALIEXPRESS_TRACKING_ID:\s*'a-search'/);
    const fr = utf8NoBom('docs/fr/FR-169.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /aliexpress/);
    assert.match(fr, /ALIEXPRESS_API_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /aliexpress/i);
    assert.match(matrix, /ALIEXPRESS_API_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\baliexpress\b/i,
    );
  });

  it('synth: aliexpress live+sandbox workers+queues; secret refs; dark ids absent', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr169');
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
      const envVars = envOf(`a-search-aliexpress-worker-${env}`);
      assert.ok(envVars.ALIEXPRESS_API_KEY, `missing API key ${env}`);
      const keyVal = String(envVars.ALIEXPRESS_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.ALIEXPRESS_API_KEY === 'object',
        `ALIEXPRESS_API_KEY must be Secrets Manager ref (${env})`,
      );
      assert.equal(envVars.ALIEXPRESS_TRACKING_ID, 'a-search');
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-aliexpress-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-aliexpress-${env}`);
    }

    for (const dark of ['skimlinks', 'partnerize', 'webgains']) {
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
