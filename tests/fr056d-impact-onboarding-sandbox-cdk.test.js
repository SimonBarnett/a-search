'use strict';

/**
 * FR-056d: CDK a-search-impact-onboarding-sandbox with A_SEARCH_ENV=sandbox.
 * Schedules are out of scope (FR-056e).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056d CDK impact onboarding Lambda sandbox', () => {
  it('stack declares ImpactOnboardingSandbox with A_SEARCH_ENV sandbox', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /ImpactOnboardingSandboxFunction/);
    assert.match(text, /a-search-impact-onboarding-sandbox/);
    assert.match(text, /A_SEARCH_ENV:\s*'sandbox'/);
    // Lambda construct only (EventBridge rules are FR-056e after this fn)
    const block = text.slice(
      text.indexOf('ImpactOnboardingSandboxFunction'),
      text.indexOf('// FR-056e:'),
    );
    assert.ok(block.length > 40, 'expected sandbox function region');
    assert.doesNotMatch(block, /events\.Rule|Schedule\.rate|Schedule\.cron/);
  });

  it('impact onboarding src exports Lambda handler', () => {
    const handlerPath = path.join(
      root,
      'providers',
      'local',
      'impact',
      'onboarding',
      'src',
      'handler.js',
    );
    assert.ok(fs.existsSync(handlerPath), 'handler.js required for CDK handler');
    const { handler } = require(handlerPath);
    assert.equal(typeof handler, 'function');
  });

  it('npm run synth exits 0; template has impact sandbox + A_SEARCH_ENV sandbox', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const fns = Object.values(parsed.Resources || {}).filter(
      (r) => r.Type === 'AWS::Lambda::Function',
    );
    const sandbox = fns.find(
      (r) =>
        r.Properties &&
        r.Properties.FunctionName === 'a-search-impact-onboarding-sandbox',
    );
    assert.ok(sandbox, 'template must include a-search-impact-onboarding-sandbox');
    assert.equal(
      sandbox.Properties.Environment.Variables.A_SEARCH_ENV,
      'sandbox',
    );
  });
});
