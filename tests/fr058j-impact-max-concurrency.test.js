'use strict';

/**
 * FR-058j: CDK SQS maxConcurrency for impact workers only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const registryPath = path.join(root, 'providers', 'registry.json');

describe('FR-058j impact SQS maxConcurrency', () => {
  it('registry impact has rateLimit.maxConcurrency and stack applies it for impact', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const impact = registry.sources.find((s) => s.id === 'impact');
    assert.ok(impact && impact.rateLimit, 'impact rateLimit required');
    // AWS SQS ESM MaximumConcurrency minimum is 2
    assert.equal(impact.rateLimit.maxConcurrency, 2);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /maxConcurrency/);
    // Shared helper: allow === 'impact' inline OR !== 'impact' in gate.
    assert.match(
      text,
      /src\.id\s*===\s*['"]impact['"]|src\.id\s*!==\s*['"]impact['"]|id\s*===\s*['"]impact['"]/,
    );
    assert.match(
      text,
      /impact[\s\S]{0,200}maxConcurrency|maxConcurrency[\s\S]{0,200}impact/i,
    );
  });

  it('npm run synth: impact event source mappings set MaximumConcurrency', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit template');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const mappings = Object.entries(parsed.Resources || {}).filter(
      ([, res]) => res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    const impactMappings = mappings.filter(([logicalId, res]) => {
      const id = String(logicalId);
      const fn = JSON.stringify(res.Properties || {});
      // CDK logical ids are PascalCase (ImpactLive...); match /impact/i.
      return /impact/i.test(id) || /impact/i.test(fn);
    });
    assert.ok(impactMappings.length >= 1, 'expected impact event source mapping(s)');
    for (const [, res] of impactMappings) {
      const props = res.Properties || {};
      const max =
        props.MaximumConcurrency != null
          ? props.MaximumConcurrency
          : props.ScalingConfig && props.ScalingConfig.MaximumConcurrency;
      assert.equal(
        max,
        2,
        `impact mapping missing MaximumConcurrency=2: ${JSON.stringify(props)}`,
      );
    }
  });
});
