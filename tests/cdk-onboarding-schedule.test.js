'use strict';

/**
 * FR-056f: pin CDK EventBridge schedules for onboarding drain Lambdas.
 * Fail-when: only maintainer/search schedules remain (rules removed).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056f CDK onboarding schedules', () => {
  it('stack declares onboarding EventBridge rules (not only maintainer)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /AwinOnboardingLiveSchedule/);
    assert.match(text, /AwinOnboardingSandboxSchedule/);
    assert.match(text, /ImpactOnboardingSandboxSchedule/);
    assert.match(text, /ruleName:\s*'a-search-awin-onboarding-live'/);
    assert.match(text, /ruleName:\s*'a-search-awin-onboarding-sandbox'/);
    assert.match(text, /ruleName:\s*'a-search-impact-onboarding-sandbox'/);
    assert.match(text, /Schedule\.rate\(cdk\.Duration\.days\(1\)\)/);
    assert.match(text, /targets:\s*\[\s*new targets\.LambdaFunction\(awinOnboardingLive\)/);
    assert.match(
      text,
      /targets:\s*\[\s*new targets\.LambdaFunction\(awinOnboardingSandbox\)/,
    );
    assert.match(
      text,
      /targets:\s*\[\s*new targets\.LambdaFunction\(impactOnboardingSandbox\)/,
    );
  });

  it('npm run synth exits 0; template has onboarding schedule rules', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const rules = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Events::Rule',
    );
    const names = rules
      .map((res) => res.Properties && res.Properties.Name)
      .filter(Boolean);
    assert.ok(
      names.includes('a-search-awin-onboarding-live'),
      'missing EventBridge rule a-search-awin-onboarding-live',
    );
    assert.ok(
      names.includes('a-search-awin-onboarding-sandbox'),
      'missing EventBridge rule a-search-awin-onboarding-sandbox',
    );
    assert.ok(
      names.includes('a-search-impact-onboarding-sandbox'),
      'missing EventBridge rule a-search-impact-onboarding-sandbox',
    );
    // Fail-when: only maintainer schedules exist
    const onboardingRules = rules.filter(
      (res) =>
        res.Properties &&
        typeof res.Properties.Name === 'string' &&
        res.Properties.Name.includes('onboarding'),
    );
    assert.ok(
      onboardingRules.length >= 3,
      `expected >=3 onboarding rules, got ${onboardingRules.length}`,
    );
  });
});
