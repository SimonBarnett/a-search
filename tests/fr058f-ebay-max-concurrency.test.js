'use strict';

/**
 * FR-058f: CDK SQS maxConcurrency for ebay workers only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const registryPath = path.join(root, 'providers', 'registry.json');

describe('FR-058f ebay SQS maxConcurrency', () => {
  it('registry ebay has rateLimit.maxConcurrency and stack applies it for ebay', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const ebay = registry.sources.find((s) => s.id === 'ebay');
    assert.ok(ebay && ebay.rateLimit, 'ebay rateLimit required');
    // AWS SQS ESM MaximumConcurrency minimum is 2
    assert.equal(ebay.rateLimit.maxConcurrency, 2);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /maxConcurrency/);
    // Shared helper (FR-058e/f): allow === 'ebay' inline OR !== 'ebay' in amazon|ebay gate.
    assert.match(
      text,
      /src\.id\s*===\s*['"]ebay['"]|src\.id\s*!==\s*['"]ebay['"]|id\s*===\s*['"]ebay['"]/,
    );
    // Fail-when: amazon-only wire without ebay gate would still match maxConcurrency —
    // require ebay id gate so other providers stay OOS.
    assert.match(
      text,
      /ebay[\s\S]{0,200}maxConcurrency|maxConcurrency[\s\S]{0,200}ebay/i,
    );
  });

  it('npm run synth: ebay event source mappings set MaximumConcurrency', () => {
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 180_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit template');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const mappings = Object.entries(parsed.Resources || {}).filter(
      ([, res]) => res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    const ebayMappings = mappings.filter(([logicalId, res]) => {
      const id = String(logicalId);
      const fn = JSON.stringify(res.Properties || {});
      return /ebay/i.test(id) || /ebay/i.test(fn);
    });
    assert.ok(ebayMappings.length >= 1, 'expected ebay event source mapping(s)');
    for (const [, res] of ebayMappings) {
      const props = res.Properties || {};
      const max =
        props.MaximumConcurrency != null
          ? props.MaximumConcurrency
          : props.ScalingConfig && props.ScalingConfig.MaximumConcurrency;
      assert.equal(
        max,
        2,
        `ebay mapping missing MaximumConcurrency=2: ${JSON.stringify(props)}`,
      );
    }
  });
});
