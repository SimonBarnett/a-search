'use strict';

/**
 * FR-058h: CDK SQS maxConcurrency for cj workers only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const registryPath = path.join(root, 'providers', 'registry.json');

describe('FR-058h cj SQS maxConcurrency', () => {
  it('registry cj has rateLimit.maxConcurrency and stack applies it for cj', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const cj = registry.sources.find((s) => s.id === 'cj');
    assert.ok(cj && cj.rateLimit, 'cj rateLimit required');
    // AWS SQS ESM MaximumConcurrency minimum is 2
    assert.equal(cj.rateLimit.maxConcurrency, 2);

    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /maxConcurrency/);
    // Shared helper (FR-058e/f/h): allow === 'cj' inline OR !== 'cj' in amazon|ebay|cj gate.
    assert.match(
      text,
      /src\.id\s*===\s*['"]cj['"]|src\.id\s*!==\s*['"]cj['"]|id\s*===\s*['"]cj['"]/,
    );
    // Fail-when: amazon/ebay-only wire without cj gate would still match maxConcurrency —
    // require cj id gate so other providers stay OOS.
    assert.match(
      text,
      /cj[\s\S]{0,200}maxConcurrency|maxConcurrency[\s\S]{0,200}cj/i,
    );
  });

  it('npm run synth: cj event source mappings set MaximumConcurrency', () => {
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
    const cjMappings = mappings.filter(([logicalId, res]) => {
      const id = String(logicalId);
      const fn = JSON.stringify(res.Properties || {});
      // CDK logical ids are PascalCase (CjLive...); match like ebay test /ebay/i.
      return /cj/i.test(id) || /cj/i.test(fn);
    });
    assert.ok(cjMappings.length >= 1, 'expected cj event source mapping(s)');
    for (const [, res] of cjMappings) {
      const props = res.Properties || {};
      const max =
        props.MaximumConcurrency != null
          ? props.MaximumConcurrency
          : props.ScalingConfig && props.ScalingConfig.MaximumConcurrency;
      assert.equal(
        max,
        2,
        `cj mapping missing MaximumConcurrency=2: ${JSON.stringify(props)}`,
      );
    }
  });
});
