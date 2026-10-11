'use strict';

/**
 * FR-176 / #1023: enable flexoffers only; FR-138 secret wiring; others stay dark.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

const STILL_DARK = ["bol", "partnerize", "webgains", "tradedoubler", "admitad", "avantlink", "shopify", "wix", "woocommerce"];

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

describe('FR-176 enable flexoffers', () => {
  it('registry enables flexoffers both envs; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const fo = byId.get('flexoffers');
    assert.ok(fo, 'registry missing flexoffers');
    assert.equal(fo.enabled.live, true);
    assert.equal(fo.enabled.sandbox, true);
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
    assert.equal(byId.get('aliexpress').enabled.live, true, 'FR-169');
    assert.equal(byId.get('etsy').enabled.live, true, 'FR-170');
    assert.equal(byId.get('skimlinks').enabled.live, true, 'FR-168');
    assert.equal(byId.get('admitad').enabled.live, false, 'FR-175 not on main');
    assert.equal(byId.get('partnerize').enabled.live, false, 'FR-172 not on main');
    assert.equal(byId.get('tradedoubler').enabled.live, false, 'FR-174 not on main');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps flexoffers; FR-176 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\bflexoffers\s*:/);
    assert.match(keysBlock[0], /FLEXOFFERS_API_KEY/);
    assert.match(keysBlock[0], /FLEXOFFERS_API_TOKEN/);
    assert.match(keysBlock[0], /FLEXOFFERS_AFFILIATE_ID/);
    const fr = utf8NoBom('docs/fr/FR-176.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /flexoffers/);
    assert.match(fr, /FLEXOFFERS_API_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /flexoffers/i);
    assert.match(matrix, /FLEXOFFERS_API_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\bflexoffers\b/i,
    );
  });

  it('synth: flexoffers live+sandbox workers+queues; secret refs; dark ids absent', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-fr176');
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
      const envVars = envOf(`a-search-flexoffers-worker-${env}`);
      assert.ok(envVars.FLEXOFFERS_API_KEY, `missing API key ${env}`);
      const keyVal = String(envVars.FLEXOFFERS_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.FLEXOFFERS_API_KEY === 'object',
        `FLEXOFFERS_API_KEY must be Secrets Manager ref (${env})`,
      );
      assert.ok(envVars.FLEXOFFERS_AFFILIATE_ID, `missing affiliate id ${env}`);
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-flexoffers-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-flexoffers-${env}`);
    }

    for (const dark of ['bol', 'partnerize', 'admitad', 'tradedoubler']) {
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
