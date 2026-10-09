'use strict';

/**
 * FR-136: CDK Secrets Manager wiring for entry JWT_* (from secret ARN context).
 * Synth must use Secrets Manager dynamic refs — never plaintext JWT secret values.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const deployPath = path.join(root, 'docs', 'deploy.md');
const endpointSearch = path.join(root, 'docs', 'endpoint-search.md');
const releaseGap = path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md');

const JWT_KEYS = ['JWT_ISSUER', 'JWT_AUDIENCE', 'JWT_JWKS_URL', 'JWT_SECRET'];

describe('FR-136 CDK entry JWT Secrets Manager wiring', () => {
  it('stack defines wireEntryJwtSecrets + fromSecretCompleteArn / Secret path', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireEntryJwtSecrets/);
    assert.match(text, /FR-136|jwtSecretArn/);
    assert.match(text, /fromSecretCompleteArn|secretsmanager\.Secret/);
    assert.match(text, /secretValueFromJson/);
    assert.match(text, /grantRead/);
    assert.match(text, /wireEntryJwtSecrets\(\s*entry/);
    for (const k of JWT_KEYS) {
      assert.match(text, new RegExp(k));
    }
  });

  it('docs/deploy.md documents jwtSecretArn context + FR-123 cross-link', () => {
    assert.equal(fs.existsSync(deployPath), true, 'docs/deploy.md missing');
    const text = fs.readFileSync(deployPath, 'utf8');
    assert.match(text, /FR-136|JWT/);
    assert.match(text, /jwtSecretArn|Secrets Manager/i);
    assert.match(text, /JWT_ISSUER/);
    assert.match(text, /endpoint-search\.md|FR-123/);
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('endpoint-search JWT deploy points at deploy.md Secrets Manager wiring', () => {
    const text = fs.readFileSync(endpointSearch, 'utf8');
    assert.match(text, /deploy\.md/);
    assert.match(text, /FR-136|Secrets Manager/i);
  });

  it('release-gap marks JWT_* CDK secrets Yes / FR-136', () => {
    const text = fs.readFileSync(releaseGap, 'utf8');
    assert.match(
      text,
      /JWT_\*[\s\S]{0,80}(?:Yes|FR-136)/i,
    );
  });

  it('synth entry has JWT_* as Secrets Manager resolve refs (no plaintext secrets)', () => {
    // In-process synth (not npm spawn): mssql worker asset staging can exceed
    // spawnSync timeouts on fleet seats (same pattern as FR-137).
    const cdk = require('aws-cdk-lib');
    const { ASearchStack } = require('../cdk/lib/a-search-stack');
    const outdir = path.join(root, 'cdk.out');
    const app = new cdk.App({ outdir });
    new ASearchStack(app, 'ASearchStack');
    app.synth();
    const templatePath = path.join(outdir, 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'missing ASearchStack.template.json');
    const raw = fs.readFileSync(templatePath, 'utf8');
    const tpl = JSON.parse(raw);
    const resources = tpl.Resources || {};

    const entry = Object.values(resources).find(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        res.Properties.FunctionName === 'a-search-entry',
    );
    assert.ok(entry, 'missing a-search-entry');
    const vars = entry.Properties.Environment.Variables || {};
    for (const k of JWT_KEYS) {
      assert.ok(vars[k] !== undefined, `entry missing env ${k}`);
      const v = vars[k];
      const asStr = typeof v === 'string' ? v : JSON.stringify(v);
      assert.match(
        asStr,
        /secretsmanager|Secret|resolve:/i,
        `${k} must be a Secrets Manager dynamic ref, got ${asStr.slice(0, 120)}`,
      );
    }

    // No realistic JWT / HS256 secret literals in the whole template.
    assert.doesNotMatch(raw, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/);
    assert.doesNotMatch(raw, /JWT_SECRET["']?\s*:\s*["'][^"'{\\s]{8,}/);

    const hasSecret = Object.values(resources).some(
      (res) =>
        res &&
        (res.Type === 'AWS::SecretsManager::Secret' ||
          (res.Type === 'AWS::IAM::Policy' &&
            JSON.stringify(res).includes('secretsmanager'))),
    );
    assert.ok(hasSecret, 'expected Secrets Manager secret and/or IAM grant');
  });
});
