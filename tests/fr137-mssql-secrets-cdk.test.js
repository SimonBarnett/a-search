'use strict';

/**
 * FR-137 Decision superseded by FR-3949: no MSSQL Secrets Manager wiring in CDK.
 * Pins that the stack no longer exports wireMssqlSecretEnv / MssqlConnSecret.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');
const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-137 MSSQL Secrets Manager CDK wiring (superseded by FR-3949)', () => {
  it('stack has no wireMssqlSecretEnv / MssqlConnSecret / mssql context ARN', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.doesNotMatch(text, /function wireMssqlSecretEnv/);
    assert.doesNotMatch(text, /\bwireMssqlSecretEnv\s*\(/);
    assert.doesNotMatch(text, /MssqlConnSecret/);
    assert.doesNotMatch(text, /MssqlSecretArn/);
    assert.doesNotMatch(text, /mssqlAppSecretArn|mssqlSecretArn/);
    assert.match(text, /FR-3949/);
    assert.match(text, /isLocalProviderFolder/);
  });

  it('synth: no Lambda has MSSQL_* / MADEIRADB_DATABASE; no MssqlSecretArn output', (t) => {
    try {
      require.resolve('jose', {
        paths: [path.join(root, 'entry'), root],
      });
    } catch {
      t.skip('missing jose for entry asset staging (FR #3717); CI owns synth');
      return;
    }
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
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const tpl = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const resources = tpl.Resources || {};

    for (const [id, res] of Object.entries(resources)) {
      if (!res || res.Type !== 'AWS::Lambda::Function') continue;
      const env =
        (res.Properties &&
          res.Properties.Environment &&
          res.Properties.Environment.Variables) ||
        {};
      for (const key of Object.keys(env)) {
        assert.doesNotMatch(
          key,
          /^MSSQL_|^MADEIRADB_DATABASE$/,
          `${id} must not have ${key}`,
        );
      }
    }

    assert.ok(
      !JSON.stringify(tpl.Outputs || {}).includes('MssqlSecretArn'),
      'no MssqlSecretArn output',
    );
  });

  it('docs still record FR-137 history; FR-3949 supersedes stack wiring', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-137.md'), 'utf8');
    assert.match(fr, /Decision|LOCKED|wireMssqlSecretEnv|mssqlSecretArn/i);

    const envDocs = fs.readFileSync(
      path.join(root, 'docs', 'environments.md'),
      'utf8',
    );
    assert.match(envDocs, /FR-137/);
  });
});
