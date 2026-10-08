'use strict';

/**
 * FR-056e: EventBridge rules for onboarding Lambdas present in the stack.
 * Lambda code is out of scope. Cadence: daily (clubscan Awin-Onboarding intent).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056e EventBridge rules for onboarding Lambdas', () => {
  it('stack declares daily onboarding rules for each onboarding Lambda', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /AwinOnboardingLiveSchedule/);
    assert.match(text, /ImpactOnboardingSandboxSchedule/);\n    assert.match(text, /AwinOnboardingSandboxSchedule/);
    assert.match(text, /ruleName:\s*'a-search-awin-onboarding-live'/);
    assert.match(text, /ruleName:\s*'a-search-impact-onboarding-sandbox'/);\n    assert.match(text, /ruleName:\s*'a-search-awin-onboarding-sandbox'/);
    assert.match(text, /Schedule\.rate\(\s*cdk\.Duration\.days\(\s*1\s*\)\s*\)/);
    assert.match(text, /targets:\s*\[\s*new\s+targets\.LambdaFunction\(\s*awinOnboardingLive\s*\)/);
    assert.match(text, /targets:\s*\[\s*new\s+targets\.LambdaFunction\(\s*impactOnboardingSandbox\s*\)/);\n    assert.match(text, /targets:\s*\[\s*new\s+targets\.LambdaFunction\(\s*awinOnboardingSandbox\s*\)/);
    // Fail-when: only maintainer schedules exist
    assert.match(text, /MaintainerLiveSchedule/);
    assert.notEqual(
      text.indexOf('AwinOnboardingLiveSchedule'),
      -1,
      'onboarding rules must exist alongside maintainer',
    );
  });

  it('cdk README documents onboarding EventBridge rule names', () => {
    const readme = fs.readFileSync(path.join(root, 'cdk', 'README.md'), 'utf8');
    assert.match(readme, /a-search-awin-onboarding-live/);
    assert.match(readme, /a-search-impact-onboarding-sandbox/);\n    assert.match(readme, /a-search-awin-onboarding-sandbox/);
    assert.match(readme, /FR-056e/);
    assert.match(readme, /daily|Duration\.days|once per day/i);
  });

  it('npm run synth: template rules target onboarding function names', () => {
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 180_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const rules = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Events::Rule',
    );
    const byName = (name) =>
      rules.find((res) => res.Properties && res.Properties.Name === name);
    const awinRule = byName('a-search-awin-onboarding-live');
    const impactRule = byName('a-search-impact-onboarding-sandbox');\n    const awinSbRule = byName('a-search-awin-onboarding-sandbox');
    assert.ok(awinRule, 'template must include rule a-search-awin-onboarding-live');
    assert.ok(impactRule, 'template must include rule a-search-impact-onboarding-sandbox');\n    assert.ok(awinSbRule, 'template must include rule a-search-awin-onboarding-sandbox');
    const awinTargets = JSON.stringify(awinRule.Properties.Targets || []);
    const impactTargets = JSON.stringify(impactRule.Properties.Targets || []);
    assert.match(awinTargets, /AwinOnboardingLive|awin-onboarding-live/i);
    assert.match(impactTargets, /ImpactOnboardingSandbox|impact-onboarding-sandbox/i);
    // rate(1 day) → ScheduleExpression rate(1 day)
    assert.match(
      String(awinRule.Properties.ScheduleExpression || ''),
      /rate\s*\(\s*1\s+day\s*\)/i,
    );
  });
});
