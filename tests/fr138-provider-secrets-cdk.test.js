'use strict';

/**
 * FR-138: CDK Secrets Manager wiring for enabled provider credentials.
 * Enabled sources include FR-170 etsy; other Phase-2 stubs stay dark.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

const ENABLED_IDS = [
  'amazon',
  'ebay',
  'rakuten',
  'cj',
  'awin',
  'impact',
  'etsy',
];
const STAY_DARK_SAMPLE = ['kelkoo', 'skimlinks', 'partnerize', 'webgains'];

describe('FR-138 provider Secrets Manager CDK wiring', () => {
  it('stack declares wireProviderSecretEnv + per-source ARN context + enabled keys only', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireProviderSecretEnv/);
    assert.match(text, /PROVIDER_CREDENTIAL_KEYS/);
    assert.match(text, /ProviderSecretArn|providerSecretArnPlaceholder/);
    assert.match(text, /fromSecretCompleteArn/);
    assert.match(text, /grantRead/);
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock, 'PROVIDER_CREDENTIAL_KEYS object missing');
    for (const id of ENABLED_IDS) {
      assert.match(
        keysBlock[0],
        new RegExp(`\\b${id}\\s*:`),
        `expected credential map entry for ${id}`,
      );
    }
    assert.match(text, /function providerSecretContextKey/);
    assert.match(text, /ProviderSecretArn/);
    // Credential keys from .env.example (not SQS/S3/MSSQL)
    assert.match(text, /AMAZON_ACCESS_KEY/);
    assert.match(text, /AMAZON_SECRET_KEY/);
    assert.match(text, /EBAY_CLIENT_SECRET/);
    assert.match(text, /RAKUTEN_APPLICATION_KEY/);
    assert.match(text, /CJ_API_TOKEN/);
    assert.match(text, /AWIN_API_TOKEN/);
    assert.match(text, /IMPACT_CAMPAIGN_ID/);
    assert.match(text, /ETSY_API_KEY/);
    // Stay-dark ids must not appear in PROVIDER_CREDENTIAL_KEYS block
    for (const dark of STAY_DARK_SAMPLE) {
      assert.doesNotMatch(
        keysBlock[0],
        new RegExp(`\\b${dark}\\b`),
        `stay-dark ${dark} must not be in PROVIDER_CREDENTIAL_KEYS`,
      );
    }
    assert.doesNotMatch(
      text,
      /AMAZON_SECRET_KEY\s*[:=]\s*['"][^'"<{][^'"]+['"]/,
    );
  });

  it('synth: enabled workers get provider secret refs; stay-dark have no workers; grants scoped', () => {
    // In-process synth (mssql/provider asset staging can exceed npm spawn timeouts).
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out');
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();
    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};
    const fns = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::Lambda::Function',
    );

    function envOf(name) {
      const fn = fns.find(
        (res) => res.Properties && res.Properties.FunctionName === name,
      );
      assert.ok(fn, `missing Lambda ${name}`);
      return fn.Properties.Environment.Variables || {};
    }

    function assertSecretRef(env, key, fnName) {
      assert.ok(env[key], `${fnName} missing ${key}`);
      const val = String(env[key]);
      assert.ok(
        val.includes('resolve:secretsmanager') ||
          val.includes('Secret') ||
          typeof env[key] === 'object',
        `${fnName} ${key} must be a Secrets Manager ref, got ${val.slice(0, 80)}`,
      );
    }

    const amazonLive = envOf('a-search-amazon-worker-live');
    assertSecretRef(amazonLive, 'AMAZON_ACCESS_KEY', 'amazon-live');
    assertSecretRef(amazonLive, 'AMAZON_SECRET_KEY', 'amazon-live');
    assertSecretRef(amazonLive, 'AMAZON_PARTNER_TAG', 'amazon-live');
    assert.equal(amazonLive.AMAZON_HOST, 'webservices.amazon.co.uk');

    const ebaySandbox = envOf('a-search-ebay-worker-sandbox');
    assertSecretRef(ebaySandbox, 'EBAY_CLIENT_ID', 'ebay-sandbox');
    assertSecretRef(ebaySandbox, 'EBAY_CLIENT_SECRET', 'ebay-sandbox');
    assert.equal(ebaySandbox.EBAY_ENV, 'sandbox');

    assertSecretRef(
      envOf('a-search-rakuten-worker-live'),
      'RAKUTEN_APPLICATION_KEY',
      'rakuten-live',
    );
    assertSecretRef(
      envOf('a-search-cj-worker-live'),
      'CJ_API_TOKEN',
      'cj-live',
    );
    assertSecretRef(
      envOf('a-search-awin-worker-live'),
      'AWIN_API_TOKEN',
      'awin-live',
    );
    assertSecretRef(
      envOf('a-search-impact-worker-sandbox'),
      'IMPACT_CAMPAIGN_ID',
      'impact-sandbox',
    );
    assertSecretRef(
      envOf('a-search-awin-onboarding-live'),
      'AWIN_API_TOKEN',
      'awin-onboarding-live',
    );
    assertSecretRef(
      envOf('a-search-impact-onboarding-sandbox'),
      'IMPACT_CAMPAIGN_ID',
      'impact-onboarding-sandbox',
    );

    assertSecretRef(
      envOf('a-search-etsy-worker-live'),
      'ETSY_API_KEY',
      'etsy-live',
    );
    assertSecretRef(
      envOf('a-search-etsy-worker-sandbox'),
      'ETSY_API_KEY',
      'etsy-sandbox',
    );
    assert.equal(
      envOf('a-search-etsy-worker-live').ETSY_TRACKING_ID,
      'a-search',
    );

    // Stay-dark: no worker Lambdas
    for (const dark of STAY_DARK_SAMPLE) {
      const hit = fns.find(
        (res) =>
          res.Properties &&
          typeof res.Properties.FunctionName === 'string' &&
          res.Properties.FunctionName.includes(`-${dark}-worker-`),
      );
      assert.equal(
        hit,
        undefined,
        `stay-dark ${dark} must not have a worker Lambda`,
      );
    }

    // IAM: GetSecretValue present; never Resource *
    const policies = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::IAM::Policy',
    );
    let sawProviderGet = false;
    for (const pol of policies) {
      const pd = pol.Properties && pol.Properties.PolicyDocument;
      const statements = (pd && pd.Statement) || [];
      for (const st of statements) {
        const actions = [].concat(st.Action || []);
        if (
          !actions.some(
            (a) =>
              typeof a === 'string' &&
              a.toLowerCase().includes('secretsmanager:getsecretvalue'),
          )
        ) {
          continue;
        }
        for (const res of [].concat(st.Resource || [])) {
          if (res === '*') {
            assert.fail('secretsmanager IAM must not use Resource *');
          }
          const s = typeof res === 'string' ? res : JSON.stringify(res);
          if (s.includes('a-search/provider/') || s.includes('ProviderSecret')) {
            sawProviderGet = true;
          }
        }
      }
    }
    assert.ok(
      sawProviderGet,
      'expected scoped secretsmanager:GetSecretValue for provider secrets',
    );

    const raw = fs.readFileSync(templatePath, 'utf8');
    assert.doesNotMatch(raw, /"AMAZON_SECRET_KEY"\s*:\s*"[^{][^"]{8,}"/);
    assert.doesNotMatch(raw, /"EBAY_CLIENT_SECRET"\s*:\s*"[^{][^"]{8,}"/);
  });

  it('docs/secrets-matrix.md covers enabled providers; stay-dark omitted from grants', () => {
    const matrixPath = path.join(root, 'docs', 'secrets-matrix.md');
    assert.ok(fs.existsSync(matrixPath), 'docs/secrets-matrix.md missing');
    const matrix = fs.readFileSync(matrixPath, 'utf8');
    assert.match(matrix, /FR-138/);
    for (const id of ENABLED_IDS) {
      assert.match(matrix, new RegExp(id, 'i'), `matrix missing ${id}`);
    }
    assert.match(matrix, /AMAZON_ACCESS_KEY|provider.*secret/i);
    assert.match(matrix, /stay-dark|omitted|enabled only/i);

    const cdkReadme = fs.readFileSync(
      path.join(root, 'cdk', 'README.md'),
      'utf8',
    );
    assert.match(cdkReadme, /FR-138/);
    assert.match(cdkReadme, /amazonProviderSecretArn|ProviderSecretArn/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-138.md'), 'utf8');
    assert.match(fr, /Decision|LOCKED|wireProviderSecretEnv/i);
  });
});
