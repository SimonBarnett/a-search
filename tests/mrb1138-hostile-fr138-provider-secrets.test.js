'use strict';

/**
 * docs/mrb-1138: hostile pins for FR-138 provider Secrets Manager CDK wiring (PR #1138).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const product = path.join(root, 'tests', 'fr138-provider-secrets-cdk.test.js');
const matrix = path.join(root, 'docs', 'secrets-matrix.md');
const releaseGap = path.join(
  root,
  'docs',
  'release-gap-aws-installable-2026-10-09.md',
);

const ENABLED = ['amazon', 'ebay', 'rakuten', 'cj', 'awin', 'impact', 'kelkoo', 'aliexpress', 'etsy', 'skimlinks', 'bol'];
const STAY_DARK = ['partnerize', 'webgains', 'tradedoubler'];

describe('MRB #1138 hostile FR-138 provider secrets', () => {
  it('product test uses in-process synth + stay-dark omission', () => {
    assert.equal(fs.existsSync(product), true);
    const p = fs.readFileSync(product, 'utf8');
    assert.match(p, /wireProviderSecretEnv/);
    assert.match(p, /PROVIDER_CREDENTIAL_KEYS/);
    assert.match(p, /new cdk\.App/);
    assert.match(p, /app\.synth\(\)/);
    assert.match(p, /stay-dark|STAY_DARK/);
    assert.match(p, /GetSecretValue/);
  });

  it('stack maps only enabled ids; onboarding awin+impact wired', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireProviderSecretEnv/);
    assert.match(text, /function providerSecretArnPlaceholder/);
    assert.match(text, /fromSecretCompleteArn/);
    assert.match(text, /AbCdEf/);
    const keysBlock = text.match(
      /PROVIDER_CREDENTIAL_KEYS\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(keysBlock);
    for (const id of ENABLED) {
      assert.match(keysBlock[0], new RegExp(`\\b${id}\\s*:`));
    }
    for (const dark of STAY_DARK) {
      assert.doesNotMatch(keysBlock[0], new RegExp(`\\b${dark}\\b`));
    }
    assert.match(text, /wireProviderSecretEnv\(\s*awinOnboardingLive/);
    assert.match(text, /wireProviderSecretEnv\(\s*impactOnboardingLive/);
    assert.match(text, /PROVIDER_CREDENTIAL_KEYS\.awin/);
    assert.match(text, /PROVIDER_CREDENTIAL_KEYS\.impact/);
  });

  it('secrets-matrix + release-gap keep-both JWT/MSSQL/provider Yes', () => {
    assert.equal(fs.existsSync(matrix), true);
    const m = fs.readFileSync(matrix, 'utf8');
    assert.match(m, /FR-138/);
    for (const id of ENABLED) {
      assert.match(m, new RegExp(id, 'i'));
    }
    const gap = fs.readFileSync(releaseGap, 'utf8');
    assert.match(gap, /FR-136/);
    assert.match(gap, /FR-137|#973/);
    assert.match(gap, /FR-138|#974/);
    assert.match(gap, /provider secrets[\s\S]{0,80}\*\*Yes\*\*/i);
  });
});
