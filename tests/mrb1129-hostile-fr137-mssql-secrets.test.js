'use strict';

/**
 * docs/mrb-1129: hostile pins for FR-137 — Decision superseded by FR-3949.
 * Assert stack has NO wireMssqlSecretEnv / MssqlConnSecret; product pin matches.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const product = path.join(root, 'tests', 'fr137-mssql-secrets-cdk.test.js');
const envDocs = path.join(root, 'docs', 'environments.md');
const releaseGap = path.join(
  root,
  'docs',
  'release-gap-aws-installable-2026-10-09.md',
);

describe('MRB #1129 hostile FR-137 MSSQL secrets (superseded by FR-3949)', () => {
  it('product test + stack assert no wireMssqlSecretEnv / MssqlConnSecret', () => {
    assert.equal(fs.existsSync(product), true);
    const p = fs.readFileSync(product, 'utf8');
    assert.match(p, /FR-3949|superseded/i);
    assert.match(p, /doesNotMatch[\s\S]{0,80}?wireMssqlSecretEnv|no wireMssqlSecretEnv/i);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.doesNotMatch(text, /function wireMssqlSecretEnv/);
    assert.doesNotMatch(text, /\bwireMssqlSecretEnv\s*\(/);
    assert.doesNotMatch(text, /MssqlConnSecret/);
    assert.doesNotMatch(text, /mssqlSecretArn|mssqlAppSecretArn/);
    assert.match(text, /FR-3949/);
    assert.match(text, /isLocalProviderFolder/);
  });

  it('onboarding kept without MSSQL wire; no maintainer MSSQL calls', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /AwinOnboardingLiveFunction|awinOnboardingLive/);
    assert.match(text, /ImpactOnboardingSandboxFunction|impactOnboardingSandbox/);
    assert.doesNotMatch(text, /wireMssqlSecretEnv\s*\(/);
    assert.doesNotMatch(text, /MaintainerLiveFunction|MaintainerSandboxFunction/);
  });

  it('docs FR-137 history + release-gap Partial JWT still open', () => {
    const env = fs.readFileSync(envDocs, 'utf8');
    assert.match(env, /FR-137/);

    const gap = fs.readFileSync(releaseGap, 'utf8');
    assert.match(gap, /FR-137|#973/);
    assert.match(gap, /Partial/);
    assert.match(gap, /FR-136|#972/);
  });
});
