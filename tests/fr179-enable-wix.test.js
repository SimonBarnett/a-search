'use strict';

/**
 * FR-179 / #1026: enable wix (merchant) only; FR-138 secret wiring; no affiliate stamp.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const workerPath = path.join(root, 'providers', 'local', 'wix', 'src', 'worker.js');

const STILL_DARK = ['webgains','admitad','flexoffers','avantlink','shopify','woocommerce'];

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

describe('FR-179 enable wix', () => {
  it('registry enables wix both envs as merchant; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const wx = byId.get('wix');
    assert.ok(wx, 'registry missing wix');
    assert.equal(wx.enabled.live, true);
    assert.equal(wx.enabled.sandbox, true);
    assert.equal(wx.class, 'merchant');
    assert.equal(wx.merchantConnect, true);
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
    assert.equal(byId.get('partnerize').enabled.live, true, 'FR-172');
    assert.equal(byId.get('bol').enabled.live, true, 'FR-171 keep-both');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps wix; no AFFILIATE; FR-179 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\bwix\s*:/);
    assert.match(keysBlock[0], /WIX_CLIENT_ID/);
    assert.match(keysBlock[0], /WIX_API_TOKEN/);
    assert.match(keysBlock[0], /WIX_SITE_ID/);
    assert.match(keysBlock[0], /WIX_STORE_URL/);
    assert.doesNotMatch(keysBlock[0], /WIX_AFFILIATE_ID/);
    const plainBlock = text.match(
      /PROVIDER_PLAIN_DEFAULTS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(plainBlock);
    assert.match(plainBlock[0], /\bwix\s*:/);
    assert.match(plainBlock[0], /WIX_API_BASE/);
    const worker = fs.readFileSync(workerPath, 'utf8');
    assert.doesNotMatch(worker, /WIX_AFFILIATE_ID/);
    assert.doesNotMatch(worker, /buildTrackedUrl\(/);
    assert.doesNotMatch(worker, /accountQueryMap/);
    const fr = utf8NoBom('docs/fr/FR-179.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /merchant/);
    assert.match(fr, /WIX_CLIENT_ID/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /wix/i);
    assert.match(matrix, /WIX_CLIENT_ID/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\bwix\b/i,
    );
  });

  it('synth: wix live+sandbox workers+queues; secret refs; dark ids absent', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr179');
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
      const envVars = envOf(`a-search-wix-worker-${env}`);
      assert.ok(envVars.WIX_CLIENT_ID, `missing CLIENT_ID ${env}`);
      const keyVal = String(envVars.WIX_CLIENT_ID);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.WIX_CLIENT_ID === 'object',
        `WIX_CLIENT_ID must be Secrets Manager ref (${env})`,
      );
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-wix-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-wix-${env}`);
    }

    for (const dark of ['shopify', 'woocommerce', 'admitad']) {
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
