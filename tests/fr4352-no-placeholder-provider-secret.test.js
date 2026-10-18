'use strict';

/**
 * FR #4352: a synth with no provider secret context must not put account
 * 000000000000 into any Lambda environment.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deployableProviderSecretArn } = require('../cdk/lib/a-search-stack');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR #4352 no placeholder provider secret', () => {
  it('rejects empty, placeholder, and non-secretsmanager ARNs', () => {
    assert.equal(deployableProviderSecretArn(''), '');
    assert.equal(deployableProviderSecretArn(undefined), '');
    assert.equal(
      deployableProviderSecretArn(
        'arn:aws:secretsmanager:eu-west-2:000000000000:secret:a-search/provider/awin-AbCdEf',
      ),
      '',
    );
    assert.equal(
      deployableProviderSecretArn(
        'arn:aws:secretsmanager:eu-west-2:123456789012:secret:a-search/provider/awin-AbCdEf',
      ),
      'arn:aws:secretsmanager:eu-west-2:123456789012:secret:a-search/provider/awin-AbCdEf',
    );
  });

  it('synth Lambda environments contain no 000000000000 ARN', () => {
    const { outDir } = ensureDefaultStackSynth(root);
    const tpl = JSON.parse(
      fs.readFileSync(path.join(outDir, 'ASearchStack.template.json'), 'utf8'),
    );
    const fns = Object.values(tpl.Resources || {}).filter(
      (res) => res && res.Type === 'AWS::Lambda::Function',
    );
    assert.ok(fns.length > 0, 'expected Lambda functions');
    for (const fn of fns) {
      const vars = (fn.Properties.Environment && fn.Properties.Environment.Variables) || {};
      const blob = JSON.stringify(vars);
      assert.equal(
        blob.includes('000000000000'),
        false,
        `${fn.Properties.FunctionName} env references account 000000000000`,
      );
    }
  });
});
