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

const STILL_DARK = ['admitad', 'flexoffers', 'wix', 'woocommerce'];

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
  it('registry holds aliexpress disabled both envs; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const ae = byId.get('aliexpress');
    assert.ok(ae, 'registry missing aliexpress');
    assert.equal(ae.enabled.live, false);
    assert.equal(ae.enabled.sandbox, false);
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

  it(
    'synth: GBP/UK hold - aliexpress workers+queues absent (folder retained)',
    {
      skip:
        process.platform === 'win32'
          ? 'FR #3717 win32 CDK synth hang; CI runs this pin'
          : false,
    },
    () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out-hold-aliexpress');
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
    for (const env of ['live', 'sandbox']) {
      const fn = fns.find(
        (res) =>
          res.Properties &&
          res.Properties.FunctionName === `a-search-aliexpress-worker-${env}`,
      );
      assert.equal(fn, undefined, `hold aliexpress must not have worker ${env}`);
      const q = queues.find(
        (q) =>
          q.Properties &&
          q.Properties.QueueName === `a-search-aliexpress-${env}`,
      );
      assert.equal(q, undefined, `hold aliexpress must not have queue ${env}`);
    }
    },
  );
});
