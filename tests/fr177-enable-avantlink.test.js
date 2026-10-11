'use strict';

/**
 * FR-177 / #1024: enable avantlink only; FR-138 secret wiring; others stay dark.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

const STILL_DARK = ['webgains', 'tradedoubler', 'admitad', 'flexoffers', 'shopify', 'wix', 'woocommerce'];

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

describe('FR-177 enable avantlink', () => {
  it('registry enables avantlink both envs; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const al = byId.get('avantlink');
    assert.ok(al, 'registry missing avantlink');
    assert.equal(al.enabled.live, true);
    assert.equal(al.enabled.sandbox, true);
    assert.equal(byId.get('partnerize').enabled.live, true, 'FR-172 partnerize.live');
    assert.equal(byId.get('partnerize').enabled.sandbox, true, 'FR-172 partnerize.sandbox');
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
    assert.equal(byId.get('aliexpress').enabled.live, true, 'FR-169');
    assert.equal(byId.get('etsy').enabled.live, true, 'FR-170');
    assert.equal(byId.get('skimlinks').enabled.live, true, 'FR-168');
    assert.equal(byId.get('admitad').enabled.live, false, 'FR-175 not on main');
    assert.equal(byId.get('flexoffers').enabled.live, false, 'FR-176 not on main');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps avantlink; FR-177 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\bavantlink\s*:/);
    assert.match(keysBlock[0], /AVANTLINK_API_KEY/);
    assert.match(keysBlock[0], /AVANTLINK_API_TOKEN/);
    assert.match(keysBlock[0], /AVANTLINK_AFFILIATE_ID/);
    const fr = utf8NoBom('docs/fr/FR-177.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /avantlink/);
    assert.match(fr, /AVANTLINK_API_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /avantlink/i);
    assert.match(matrix, /AVANTLINK_API_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\bavantlink\b/i,
    );
  });

  it('synth: avantlink live+sandbox workers+queues; secret refs; dark ids absent', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr177');
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
      const envVars = envOf(`a-search-avantlink-worker-${env}`);
      assert.ok(envVars.AVANTLINK_API_KEY, `missing API key ${env}`);
      const keyVal = String(envVars.AVANTLINK_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.AVANTLINK_API_KEY === 'object',
        `AVANTLINK_API_KEY must be Secrets Manager ref (${env})`,
      );
      assert.ok(envVars.AVANTLINK_AFFILIATE_ID, `missing affiliate id ${env}`);
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-avantlink-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-avantlink-${env}`);
    }

    for (const dark of ['bol', 'shopify', 'admitad', 'flexoffers']) {
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
