'use strict';

/**
 * FR-137: CDK Secrets Manager wiring for MSSQL_* on maintainer + local workers + onboarding.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-137 MSSQL Secrets Manager CDK wiring', () => {
  it('stack declares wireMssqlSecretEnv + context ARN + local-only workers', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireMssqlSecretEnv/);
    assert.match(text, /aws-secretsmanager|secretsmanager/);
    assert.match(text, /mssqlSecretArn/);
    assert.match(text, /fromSecretCompleteArn/);
    assert.match(text, /secretValueFromJson\(\s*['"]SERVER['"]\s*\)/);
    assert.match(text, /secretValueFromJson\(\s*['"]USER['"]\s*\)/);
    assert.match(text, /secretValueFromJson\(\s*['"]PASSWORD['"]\s*\)/);
    assert.match(text, /grantRead/);
    assert.match(text, /MSSQL_DATABASE/);
    assert.match(text, /madeiradb/);
    assert.match(text, /<sandbox-mssql-database>/);
    // Local workers only (not every worker)
    assert.match(
      text,
      /isLocalProviderFolder[\s\S]{0,120}?wireMssqlSecretEnv\(\s*worker/,
    );
    assert.match(text, /wireMssqlSecretEnv\(\s*maintainerLive/);
    assert.match(text, /wireMssqlSecretEnv\(\s*maintainerSandbox/);
    assert.match(text, /wireMssqlSecretEnv\(\s*awinOnboardingLive/);
    assert.match(text, /wireMssqlSecretEnv\(\s*awinOnboardingSandbox/);
    assert.match(text, /wireMssqlSecretEnv\(\s*impactOnboardingSandbox/);
    assert.match(text, /wireMssqlSecretEnv\(\s*impactOnboardingLive/);
    // No plaintext password literals in stack source
    assert.doesNotMatch(text, /MSSQL_PASSWORD\s*[:=]\s*['"][^'"<{][^'"]+['"]/);
  });

  it('synth: SQL Lambdas get MSSQL_* dynamic refs; live amazon worker does not', () => {
    // In-process synth (not npm spawn): mssql asset staging can exceed spawnSync
    // timeouts on fleet seats; Node test runner may wait for the full stage.
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

    function assertMssqlWired(name, database) {
      const env = envOf(name);
      assert.ok(env.MSSQL_SERVER, `${name} missing MSSQL_SERVER`);
      assert.ok(env.MSSQL_USER, `${name} missing MSSQL_USER`);
      assert.ok(env.MSSQL_PASSWORD, `${name} missing MSSQL_PASSWORD`);
      assert.equal(env.MSSQL_DATABASE, database, `${name} MSSQL_DATABASE`);
      // Dynamic reference or GetAtt — not a plaintext password
      const pwd = String(env.MSSQL_PASSWORD);
      assert.ok(
        pwd.includes('resolve:secretsmanager') ||
          pwd.includes('Secret') ||
          typeof env.MSSQL_PASSWORD === 'object',
        `${name} MSSQL_PASSWORD must be a Secrets Manager ref, got ${pwd.slice(0, 80)}`,
      );
      assert.doesNotMatch(pwd, /^(SuperSecret|password|hunter2)/i);
    }

    assertMssqlWired('a-search-maintainer-live', 'madeiradb');
    assertMssqlWired(
      'a-search-maintainer-sandbox',
      '<sandbox-mssql-database>',
    );
    assertMssqlWired('a-search-awin-worker-live', 'madeiradb');
    assertMssqlWired(
      'a-search-awin-worker-sandbox',
      '<sandbox-mssql-database>',
    );
    assertMssqlWired('a-search-impact-worker-live', 'madeiradb');
    assertMssqlWired('a-search-awin-onboarding-live', 'madeiradb');
    assertMssqlWired(
      'a-search-impact-onboarding-sandbox',
      '<sandbox-mssql-database>',
    );

    const amazonLive = envOf('a-search-amazon-worker-live');
    assert.equal(
      amazonLive.MSSQL_PASSWORD,
      undefined,
      'live amazon worker must not receive MSSQL_*',
    );
    assert.equal(amazonLive.MSSQL_SERVER, undefined);

    // IAM: secretsmanager GetSecretValue present and not Resource *
    const policies = Object.values(resources).filter(
      (res) => res && res.Type === 'AWS::IAM::Policy',
    );
    let sawGetSecret = false;
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
        sawGetSecret = true;
        for (const res of [].concat(st.Resource || [])) {
          if (res === '*') {
            assert.fail('secretsmanager IAM must not use Resource *');
          }
        }
      }
    }
    assert.ok(sawGetSecret, 'expected secretsmanager:GetSecretValue grant');

    // Template must not embed a raw password assignment string
    const raw = fs.readFileSync(templatePath, 'utf8');
    assert.doesNotMatch(raw, /"MSSQL_PASSWORD"\s*:\s*"[^{][^"]{8,}"/);
  });

  it('docs mention FR-137 Secrets Manager JSON keys + context', () => {
    const envDocs = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    assert.match(envDocs, /FR-137/);
    assert.match(envDocs, /mssqlSecretArn|Secrets Manager/i);
    assert.match(envDocs, /SERVER/);
    assert.match(envDocs, /PASSWORD/);

    const cdkReadme = fs.readFileSync(
      path.join(root, 'cdk', 'README.md'),
      'utf8',
    );
    assert.match(cdkReadme, /FR-137/);
    assert.match(cdkReadme, /mssqlSecretArn/);

    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-137.md'), 'utf8');
    assert.match(fr, /Decision|LOCKED|wireMssqlSecretEnv|mssqlSecretArn/i);
  });
});
