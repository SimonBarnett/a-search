'use strict';

/**
 * docs/mrb-1127: hostile pins for FR-136 entry JWT Secrets Manager CDK wiring (PR #1127).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const product = path.join(root, 'tests', 'fr136-jwt-secrets-cdk.test.js');
const deployPath = path.join(root, 'docs', 'deploy.md');
const releaseGap = path.join(
  root,
  'docs',
  'release-gap-aws-installable-2026-10-09.md',
);

describe('MRB #1127 hostile FR-136 entry JWT secrets', () => {
  it('product test uses in-process synth + JWT_* pins', () => {
    assert.equal(fs.existsSync(product), true);
    const p = fs.readFileSync(product, 'utf8');
    assert.match(p, /wireEntryJwtSecrets/);
    assert.match(p, /JWT_ISSUER/);
    assert.match(p, /new cdk\.App/);
    assert.match(p, /app\.synth\(\)/);
    assert.doesNotMatch(p, /runCdkSynth/);
  });

  it('stack resolveEntryJwtSecret + wireEntryJwtSecrets contiguous', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function resolveEntryJwtSecret/);
    assert.match(text, /function wireEntryJwtSecrets/);
    assert.match(text, /jwtSecretArn/);
    assert.match(text, /fromSecretCompleteArn/);
    assert.match(text, /secretValueFromJson/);
    assert.match(text, /wireEntryJwtSecrets\(\s*entry/);
    assert.match(text, /EntryJwtSecretArn/);
    const i = text.indexOf('FR-136: JWT_* from Secrets Manager');
    assert.ok(i >= 0, 'missing FR-136 constructor wiring comment');
    const window = text.slice(i, i + 280);
    assert.match(window, /resolveEntryJwtSecret/);
    assert.match(window, /wireEntryJwtSecrets/);
    assert.doesNotMatch(window, /\u2014/);
  });

  it('deploy.md + release-gap keep-both JWT Yes and MSSQL Yes', () => {
    assert.equal(fs.existsSync(deployPath), true);
    const deploy = fs.readFileSync(deployPath, 'utf8');
    assert.match(deploy, /jwtSecretArn/);
    assert.match(deploy, /JWT_ISSUER/);
    assert.match(deploy, /FR-136|FR-123/);

    const gap = fs.readFileSync(releaseGap, 'utf8');
    assert.match(gap, /JWT_\*[\s\S]{0,80}Yes/i);
    assert.match(gap, /FR-136/);
    assert.match(gap, /FR-137|#973/);
    assert.match(gap, /MSSQL_\*/);
    assert.match(gap, /FR-138/);
  });
});
