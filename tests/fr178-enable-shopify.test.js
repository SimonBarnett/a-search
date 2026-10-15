'use strict';

/**
 * FR-178 / #1025: enable shopify (merchant) only; FR-138 secret wiring; no affiliate stamp.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const workerPath = path.join(root, 'providers', 'local', 'shopify', 'src', 'worker.js');

const STILL_DARK = ['webgains', 'admitad', 'flexoffers', 'woocommerce'];

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

describe('FR-178 enable shopify', () => {
  it('registry enables shopify both envs as merchant; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const sh = byId.get('shopify');
    assert.ok(sh, 'registry missing shopify');
    assert.equal(sh.enabled.live, true);
    assert.equal(sh.enabled.sandbox, true);
    assert.equal(sh.class, 'merchant');
    assert.equal(sh.merchantConnect, true);
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
    assert.equal(byId.get('etsy').enabled.live, true, 'FR-170');
    assert.equal(byId.get('partnerize').enabled.live, true, 'FR-172 partnerize.live');
    assert.equal(byId.get('partnerize').enabled.sandbox, true, 'FR-172 partnerize.sandbox');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps shopify; no AFFILIATE; FR-178 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\bshopify\s*:/);
    assert.match(keysBlock[0], /SHOPIFY_API_KEY/);
    assert.match(keysBlock[0], /SHOPIFY_API_SECRET_KEY/);
    assert.doesNotMatch(keysBlock[0], /SHOPIFY_AFFILIATE_ID/);
    const worker = fs.readFileSync(workerPath, 'utf8');
    assert.doesNotMatch(worker, /SHOPIFY_AFFILIATE_ID/);
    assert.doesNotMatch(worker, /buildTrackedUrl\(/);
    assert.doesNotMatch(worker, /accountQueryMap/);
    const fr = utf8NoBom('docs/fr/FR-178.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /merchant/);
    assert.match(fr, /SHOPIFY_API_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /shopify/i);
    assert.match(matrix, /SHOPIFY_API_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\bshopify\b/i,
    );
  });

  it('synth: shopify live+sandbox workers+queues; secret refs; dark ids absent', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      // Local seats without cdk deps still pin source; CI runs synth.
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr178');
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
      const envVars = envOf(`a-search-shopify-worker-${env}`);
      assert.ok(envVars.SHOPIFY_API_KEY, `missing API key ${env}`);
      const keyVal = String(envVars.SHOPIFY_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.SHOPIFY_API_KEY === 'object',
        `SHOPIFY_API_KEY must be Secrets Manager ref (${env})`,
      );
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-shopify-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-shopify-${env}`);
    }

    for (const dark of STILL_DARK) {
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
