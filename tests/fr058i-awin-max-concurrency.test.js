'use strict';

/**
 * FR-058i: CDK SQS maxConcurrency for awin workers only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const registryPath = path.join(root, 'providers', 'registry.json');

describe('FR-058i awin SQS maxConcurrency', () => {
  it('registry awin has rateLimit.maxConcurrency and stack applies it for awin', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const awin = registry.sources.find((s) => s.id === 'awin');
    assert.ok(awin && awin.rateLimit, 'awin rateLimit required');
    // AWS SQS ESM MaximumConcurrency minimum is 2
    assert.equal(awin.rateLimit.maxConcurrency, 2);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /maxConcurrency/);
    // Shared helper: allow === 'awin' inline OR !== 'awin' in amazon|ebay|rakuten|awin gate.
    assert.match(
      text,
      /src\.id\s*===\s*['"]awin['"]|src\.id\s*!==\s*['"]awin['"]|id\s*===\s*['"]awin['"]/,
    );
    assert.match(
      text,
      /awin[\s\S]{0,200}maxConcurrency|maxConcurrency[\s\S]{0,200}awin/i,
    );
  });

  it('npm run synth: awin event source mappings set MaximumConcurrency', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit template');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const mappings = Object.entries(parsed.Resources || {}).filter(
      ([, res]) => res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    const awinMappings = mappings.filter(([logicalId, res]) => {
      const id = String(logicalId);
      const fn = JSON.stringify(res.Properties || {});
      // CDK logical ids are PascalCase (AwinLive...); match /awin/i.
      return /awin/i.test(id) || /awin/i.test(fn);
    });
    assert.ok(awinMappings.length >= 1, 'expected awin event source mapping(s)');
    for (const [, res] of awinMappings) {
      const props = res.Properties || {};
      const max =
        props.MaximumConcurrency != null
          ? props.MaximumConcurrency
          : props.ScalingConfig && props.ScalingConfig.MaximumConcurrency;
      assert.equal(
        max,
        2,
        `awin mapping missing MaximumConcurrency=2: ${JSON.stringify(props)}`,
      );
    }
  });
});
