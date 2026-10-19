'use strict';

const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

/**
 * FR-180 / #1027: enable woocommerce (merchant) only; FR-138 secret wiring; no affiliate stamp.
 * FR-3949: local/DB-backed share a-search-db-backed (no per-source AWS workers).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');


const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const workerPath = path.join(root, 'providers', 'local', 'woocommerce', 'src', 'worker.js');

const STILL_DARK = ['admitad', 'flexoffers'];

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

describe('FR-180 enable woocommerce', () => {
  it('registry enables woocommerce both envs as merchant; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const woo = byId.get('woocommerce');
    assert.ok(woo, 'registry missing woocommerce');
    assert.equal(woo.enabled.live, true);
    assert.equal(woo.enabled.sandbox, true);
    assert.equal(woo.class, 'merchant');
    assert.equal(woo.merchantConnect, true);
    assert.equal(byId.get('shopify').enabled.live, true, 'FR-178');
    assert.equal(byId.get('wix').enabled.live, true, 'FR-179 keep-both');
    assert.equal(byId.get('wix').enabled.sandbox, true, 'FR-179 keep-both');
    assert.equal(byId.get('kelkoo').enabled.live, false, 'FR-167');
    assert.equal(byId.get('etsy').enabled.live, false, 'FR-170');
    assert.equal(byId.get('partnerize').enabled.live, true, 'FR-172 partnerize.live');
    assert.equal(byId.get('partnerize').enabled.sandbox, true, 'FR-172 partnerize.sandbox');
    for (const id of STILL_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('CDK PROVIDER_CREDENTIAL_KEYS maps woocommerce; no AFFILIATE; FR-180 Decision LOCKED', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    assert.match(keysBlock[0], /\bwoocommerce\s*:/);
    assert.match(keysBlock[0], /WOOCOMMERCE_CONSUMER_KEY/);
    assert.match(keysBlock[0], /WOOCOMMERCE_CONSUMER_SECRET/);
    assert.match(keysBlock[0], /WOOCOMMERCE_STORE_URL/);
    assert.doesNotMatch(keysBlock[0], /WOOCOMMERCE_AFFILIATE_ID/);
    const worker = fs.readFileSync(workerPath, 'utf8');
    assert.doesNotMatch(worker, /WOOCOMMERCE_AFFILIATE_ID/);
    assert.doesNotMatch(worker, /buildTrackedUrl\(/);
    assert.doesNotMatch(worker, /accountQueryMap/);
    const fr = utf8NoBom('docs/fr/FR-180.md');
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /merchant/);
    assert.match(fr, /WOOCOMMERCE_CONSUMER_KEY/);
    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /woocommerce/i);
    assert.match(matrix, /WOOCOMMERCE_CONSUMER_KEY/);
    assert.doesNotMatch(
      matrix,
      /Stay-dark omitted[\s\S]*\bwoocommerce\b/i,
    );
  });

  it('synth: FR-3949 no per-source woocommerce workers/queues; shared db-backed present', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    void cdk;
    const { outDir: outdir } = ensureDefaultStackSynth(root);
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
      const workerName = 'a-search-woocommerce-worker-' + env;
      const workerHit = fns.find(
        (res) =>
          res.Properties &&
          res.Properties.FunctionName === workerName,
      );
      assert.equal(
        workerHit,
        undefined,
        'FR-3949: no ' + workerName,
      );
      const qName = 'a-search-woocommerce-' + env;
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === qName,
      );
      assert.equal(
        qHit,
        undefined,
        'FR-3949: no ' + qName + ' queue',
      );
    }

    const dbQ = queues.find(
      (q) =>
        q.Properties &&
        typeof q.Properties.QueueName === 'string' &&
        q.Properties.QueueName === 'a-search-db-backed',
    );
    assert.ok(dbQ, 'shared a-search-db-backed queue required');

    const darkIds = typeof STILL_DARK !== 'undefined' ? STILL_DARK : ['admitad'];
    for (const dark of darkIds) {
      const hit = fns.find(
        (res) =>
          res.Properties &&
          typeof res.Properties.FunctionName === 'string' &&
          res.Properties.FunctionName.includes('-' + dark + '-worker-'),
      );
      assert.equal(hit, undefined, 'stay-dark ' + dark + ' must not have worker');
    }
  });

});
