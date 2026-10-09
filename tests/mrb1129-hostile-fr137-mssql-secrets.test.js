'use strict';

/**
 * docs/mrb-1129: hostile pins for FR-137 MSSQL Secrets Manager CDK wiring (PR #1129).
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

describe('MRB #1129 hostile FR-137 MSSQL secrets', () => {
  it('product test + wireMssqlSecretEnv + local-only + grantRead', () => {
    assert.equal(fs.existsSync(product), true);
    const p = fs.readFileSync(product, 'utf8');
    assert.match(p, /assertMssqlWired/);
    assert.match(p, /a-search-amazon-worker-live/);
    assert.match(p, /must not receive MSSQL/);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /function wireMssqlSecretEnv/);
    assert.match(text, /fromSecretCompleteArn/);
    assert.match(text, /mssqlSecretArn/);
    assert.match(text, /secretValueFromJson\(\s*['"]PASSWORD['"]\s*\)/);
    assert.match(text, /grantRead/);
    assert.match(
      text,
      /isLocalProviderFolder[\s\S]{0,120}?wireMssqlSecretEnv\(\s*worker/,
    );
    // Contiguous FR-137 window must stay intact (no mid-bullet splice).
    const i = text.indexOf('FR-137:');
    assert.ok(i >= 0);
    const window = text.slice(i, i + 280);
    assert.match(window, /mssqlSecretArn/);
    assert.match(window, /SERVER/);
    assert.match(window, /PASSWORD/);
    assert.doesNotMatch(window, /\u2014/);
  });

  it('synth pin covers impact-worker-sandbox + marketplace clean', () => {
    const p = fs.readFileSync(product, 'utf8');
    // Product already pins impact-worker-live; hostile extends the pair.
    assert.match(p, /a-search-impact-worker-live/);
    assert.match(p, /a-search-awin-worker-sandbox/);
    // Template reuse path: assert local sandbox worker name appears in stack wiring.
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /wireMssqlSecretEnv\(\s*impactOnboardingSandbox/);
    assert.match(text, /wireMssqlSecretEnv\(\s*maintainerSandbox/);
  });

  it('docs FR-137 + release-gap Partial JWT still open', () => {
    const env = fs.readFileSync(envDocs, 'utf8');
    assert.match(env, /FR-137/);
    assert.match(env, /mssqlSecretArn/);
    assert.match(env, /wireMssqlSecretEnv/);

    const gap = fs.readFileSync(releaseGap, 'utf8');
    assert.match(gap, /FR-137|#973/);
    assert.match(gap, /Partial/);
    assert.match(gap, /FR-136|#972/);
  });
});
