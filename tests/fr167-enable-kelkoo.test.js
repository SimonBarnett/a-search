'use strict';

/**
 * FR-167: enable provider kijiji only (live+sandbox) + FR-138 secret wiring.
 * Other Phase-2 stay-dark ids remain false.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'providers', 'registry.json');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

/** Remaining Phase-2 stay-dark ids after FR-167 enables kijiji. */
const OTHER_STAY_DARK = [
  'skimlinks',
  'aliexpress',
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
  assert.ok(
    !(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${rel} must be UTF-8 without BOM`,
  );
  return buf.toString('utf8');
}

function assertAscii(text, label) {
  assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(text), `${label} must be ASCII`);
}

describe('FR-167 enable provider kijiji', () => {
  it('registry enables kijiji live+sandbox only; siblings stay dark', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    const kk = byId.get('kelkoo');
    assert.ok(kk, 'registry missing kijiji');
    assert.equal(kk.enabled.live, true, 'kelkoo.live');
    assert.equal(kk.enabled.sandbox, true, 'kelkoo.sandbox');
    assert.equal(kk.kind, 'live');
    assert.equal(kk.queueEnv, 'SQS_KELKOO_URL');
    for (const id of OTHER_STAY_DARK) {
      assert.ok(byId.has(id), `missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('PROVIDER_CREDENTIAL_KEYS includes kijiji; plain country default', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock, 'PROVIDER_CREDENTIAL_KEYS missing');
    assert.match(keysBlock[0], /\bkelkoo\s*:/);
    assert.match(keysBlock[0], /KELKOO_API_KEY/);
    assert.match(keysBlock[0], /KELKOO_PUBLISHER_ID/);
    assert.match(text, /PROVIDER_PLAIN_DEFAULTS[\s\S]*kelkoo[\s\S]*KELKOO_COUNTRY/);
    for (const dark of ['skimlinks', 'partnerize', 'webgains']) {
      assert.doesNotMatch(
        keysBlock[0],
        new RegExp(`\\b${dark}\\b`),
        `${dark} must stay out of PROVIDER_CREDENTIAL_KEYS`,
      );
    }
  });

  it('synth includes a-search-kelkoo live/sandbox queues and workers', () => {
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out');
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
      const workerName = `a-search-kelkoo-worker-${env}`;
      const envVars = envOf(workerName);
      assert.ok(envVars.KELKOO_API_KEY, `${workerName} missing KELKOO_API_KEY`);
      const keyVal = String(envVars.KELKOO_API_KEY);
      assert.ok(
        keyVal.includes('resolve:secretsmanager') ||
          keyVal.includes('Secret') ||
          typeof envVars.KELKOO_API_KEY === 'object',
        `${workerName} KELKOO_API_KEY must be Secrets Manager ref`,
      );
      assert.equal(envVars.KELKOO_COUNTRY, 'uk');
      const qHit = queues.find(
        (q) =>
          q.Properties &&
          typeof q.Properties.QueueName === 'string' &&
          q.Properties.QueueName === `a-search-kelkoo-${env}`,
      );
      assert.ok(qHit, `missing queue a-search-kelkoo-${env}`);
    }

    // Sibling stay-dark: no worker
    for (const dark of ['skimlinks', 'partnerize']) {
      const hit = fns.find(
        (res) =>
          res.Properties &&
          typeof res.Properties.FunctionName === 'string' &&
          res.Properties.FunctionName.includes(`-${dark}-worker-`),
      );
      assert.equal(hit, undefined, `${dark} must stay without worker`);
    }
  });

  it('FR-167 Decision LOCKED + selftest fixture note; secrets-matrix lists kijiji', () => {
    const fr = utf8NoBom('docs/fr/FR-167.md');
    assertAscii(fr, 'docs/fr/FR-167.md');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /kelkoo/i);
    assert.match(fr, /KELKOO_API_KEY|PROVIDER_CREDENTIAL_KEYS/i);
    assert.match(fr, /selftest|fixture/i);

    const matrix = utf8NoBom('docs/secrets-matrix.md');
    assert.match(matrix, /kelkoo/i);
    assert.match(matrix, /KELKOO_API_KEY/);
    assert.match(matrix, /a-search-kelkoo-worker/);

    const cdkReadme = utf8NoBom('cdk/README.md');
    assert.match(cdkReadme, /kelkooProviderSecretArn/);
  });

  it('fixture selftestProbe still green without live network', async () => {
    const {
      probeKelkooSelftest,
      DEFAULT_FIXTURE,
    } = require('../providers/live/kelkoo/src/selftestProbe');
    assert.ok(fs.existsSync(DEFAULT_FIXTURE), 'offers-ok.json required');
    const result = await probeKelkooSelftest({
      env: {
        KELKOO_API_KEY: 'fixture-token',
        KELKOO_COUNTRY: 'uk',
        A_SEARCH_ENV: 'sandbox',
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.source, 'kelkoo');
  });
});
