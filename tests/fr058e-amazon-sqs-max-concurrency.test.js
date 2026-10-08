'use strict';

/**
 * FR-058e: CDK amazon SQS event source maxConcurrency from registry rateLimit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');
const { rateLimit } = require('../providers/loadRegistry');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-058e CDK amazon SQS maxConcurrency', () => {
  it('stack sets amazon maxConcurrency from rateLimit helper', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /sqsMaxConcurrencyForSource/);
    assert.match(text, /maxConcurrency/);
    assert.match(text, /src\.id !== 'amazon'|src\.id === 'amazon'/);
    const rl = rateLimit('amazon');
    assert.ok(rl && rl.maxConcurrency === 1, 'amazon rateLimit.maxConcurrency=1');
  });

  it('npm run synth: amazon event source mappings have MaximumConcurrency', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const mappings = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    assert.ok(mappings.length > 0, 'expected EventSourceMapping resources');

    const fns = parsed.Resources || {};
    const amazonWorkerLogicalIds = new Set();
    for (const [logicalId, res] of Object.entries(fns)) {
      if (
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        typeof res.Properties.FunctionName === 'string' &&
        /^a-search-amazon-worker-(live|sandbox)$/.test(res.Properties.FunctionName)
      ) {
        amazonWorkerLogicalIds.add(logicalId);
      }
    }
    assert.equal(amazonWorkerLogicalIds.size, 2, 'expected amazon live+sandbox workers');

    const amazonMappings = mappings.filter((res) => {
      const fn = res.Properties && res.Properties.FunctionName;
      if (!fn) return false;
      // Ref to logical id
      if (typeof fn === 'object' && fn.Ref) {
        return amazonWorkerLogicalIds.has(fn.Ref);
      }
      if (typeof fn === 'string') {
        return /a-search-amazon-worker/.test(fn);
      }
      // GetAtt form
      const att = fn && fn['Fn::GetAtt'];
      return Array.isArray(att) && amazonWorkerLogicalIds.has(att[0]);
    });
    assert.ok(
      amazonMappings.length >= 2,
      `expected >=2 amazon EventSourceMappings, got ${amazonMappings.length}`,
    );
    for (const m of amazonMappings) {
      const scaling = m.Properties && m.Properties.ScalingConfig;
      assert.ok(scaling, 'amazon mapping must have ScalingConfig');
      // Registry amazon rateLimit.maxConcurrency is 1; AWS ESM floor is 2.
      assert.equal(
        scaling.MaximumConcurrency,
        2,
        'amazon MaximumConcurrency must be 2 (registry 1 clamped to AWS ESM min)',
      );
    }
  });
});
