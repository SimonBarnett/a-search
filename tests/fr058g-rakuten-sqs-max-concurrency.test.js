'use strict';

/**
 * FR-058g: CDK rakuten SQS event source maxConcurrency from registry rateLimit.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');
const { rateLimit } = require('../providers/loadRegistry');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-058g CDK rakuten SQS maxConcurrency', () => {
  it('stack sets rakuten maxConcurrency from rateLimit helper', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /sqsMaxConcurrencyForSource/);
    assert.match(text, /maxConcurrency/);
    assert.match(text, /src\.id !== 'rakuten'|src\.id === 'rakuten'/);
    const rl = rateLimit('rakuten');
    assert.ok(rl && rl.maxConcurrency === 1, 'rakuten rateLimit.maxConcurrency=1');
  });

  it('npm run synth: rakuten event source mappings have MaximumConcurrency', () => {
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
    const rakutenWorkerLogicalIds = new Set();
    for (const [logicalId, res] of Object.entries(fns)) {
      if (
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        typeof res.Properties.FunctionName === 'string' &&
        /^a-search-rakuten-worker-(live|sandbox)$/.test(
          res.Properties.FunctionName,
        )
      ) {
        rakutenWorkerLogicalIds.add(logicalId);
      }
    }
    assert.equal(
      rakutenWorkerLogicalIds.size,
      2,
      'expected rakuten live+sandbox workers',
    );

    const rakutenMappings = mappings.filter((res) => {
      const fn = res.Properties && res.Properties.FunctionName;
      if (!fn) return false;
      if (typeof fn === 'object' && fn.Ref) {
        return rakutenWorkerLogicalIds.has(fn.Ref);
      }
      if (typeof fn === 'string') {
        return /a-search-rakuten-worker/.test(fn);
      }
      const att = fn && fn['Fn::GetAtt'];
      return Array.isArray(att) && rakutenWorkerLogicalIds.has(att[0]);
    });
    assert.ok(
      rakutenMappings.length >= 2,
      `expected >=2 rakuten EventSourceMappings, got ${rakutenMappings.length}`,
    );
    for (const m of rakutenMappings) {
      const scaling = m.Properties && m.Properties.ScalingConfig;
      assert.ok(scaling, 'rakuten mapping must have ScalingConfig');
      // Registry maxConcurrency 1; AWS ESM floor is 2.
      assert.equal(
        scaling.MaximumConcurrency,
        2,
        'rakuten MaximumConcurrency must be 2 (registry 1 clamped to AWS ESM min)',
      );
    }
  });
});
