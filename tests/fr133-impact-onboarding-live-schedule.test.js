'use strict';

/**
 * FR-133: EventBridge daily rule for impact onboarding live (sibling of sandbox).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-133 impact onboarding live EventBridge schedule', () => {
  it('stack declares ImpactOnboardingLiveSchedule + ruleName + CfnOutput', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /ImpactOnboardingLiveSchedule/);
    assert.match(text, /ruleName:\s*'a-search-impact-onboarding-live'/);
    assert.match(
      text,
      /targets:\s*\[\s*new\s+targets\.LambdaFunction\(\s*impactOnboardingLive\s*\)/,
    );
    assert.match(text, /ImpactOnboardingLiveRuleName/);
    assert.match(text, /Schedule\.rate\(\s*cdk\.Duration\.days\(\s*1\s*\)\s*\)/);
  });

  it('npm run synth: template has a-search-impact-onboarding-live rule targeting live Lambda', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const rules = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Events::Rule',
    );
    const liveRule = rules.find(
      (res) => res.Properties && res.Properties.Name === 'a-search-impact-onboarding-live',
    );
    assert.ok(liveRule, 'template must include rule a-search-impact-onboarding-live');
    const targets = JSON.stringify(liveRule.Properties.Targets || []);
    assert.match(targets, /ImpactOnboardingLive|impact-onboarding-live/i);
    assert.match(
      String(liveRule.Properties.ScheduleExpression || ''),
      /rate\s*\(\s*1\s+day\s*\)/i,
    );
    assert.ok(
      parsed.Outputs && parsed.Outputs.ImpactOnboardingLiveRuleName,
      'missing Outputs.ImpactOnboardingLiveRuleName',
    );
  });
});