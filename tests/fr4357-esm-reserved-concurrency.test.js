'use strict';

/**
 * FR #4357: an SQS event source MaximumConcurrency must not exceed the
 * function ReservedConcurrentExecutions. Reserved concurrency 1 omits it.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

function functionLogicalId(fnProp) {
  if (!fnProp || typeof fnProp !== 'object') return null;
  if (typeof fnProp.Ref === 'string') return fnProp.Ref;
  const att = fnProp['Fn::GetAtt'];
  if (Array.isArray(att) && typeof att[0] === 'string') return att[0];
  return null;
}

describe('FR #4357 ESM concurrency vs reserved concurrency', () => {
  it('synth: no mapping MaximumConcurrency exceeds reserved concurrency', () => {
    const { outDir } = ensureDefaultStackSynth(root);
    const tpl = JSON.parse(
      fs.readFileSync(path.join(outDir, 'ASearchStack.template.json'), 'utf8'),
    );
    const resources = tpl.Resources || {};
    const mappings = Object.entries(resources).filter(
      ([, res]) => res && res.Type === 'AWS::Lambda::EventSourceMapping',
    );
    assert.ok(mappings.length > 0, 'expected event source mappings');
    for (const [logicalId, res] of mappings) {
      const props = res.Properties || {};
      const scaling = props.ScalingConfig;
      const max = scaling && scaling.MaximumConcurrency;
      if (max == null) continue;
      const fnId = functionLogicalId(props.FunctionName);
      const fn = fnId && resources[fnId];
      const reserved = fn && fn.Properties && fn.Properties.ReservedConcurrentExecutions;
      assert.ok(
        typeof reserved === 'number' && max <= reserved,
        logicalId + ' MaximumConcurrency ' + max + ' exceeds reserved ' + reserved,
      );
    }
    const workers = Object.values(resources).filter(
      (res) =>
        res &&
        res.Type === 'AWS::Lambda::Function' &&
        res.Properties &&
        typeof res.Properties.FunctionName === 'string' &&
        /^a-search-(amazon|ebay|rakuten|cj|awin|impact)-worker-(live|sandbox)$/.test(
          res.Properties.FunctionName,
        ),
    );
    assert.ok(workers.length >= 4, 'expected amazon/ebay/rakuten/cj workers');
    for (const fn of workers) {
      assert.equal(fn.Properties.ReservedConcurrentExecutions, 1);
    }
  });
});
