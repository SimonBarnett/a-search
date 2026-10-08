'use strict';

/**
 * FR-056c: CDK a-search-impact-onboarding-live with A_SEARCH_ENV=live.
 * Schedules are out of scope (FR-056e).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056c CDK impact onboarding Lambda live', () => {
  it('stack declares ImpactOnboardingLive with A_SEARCH_ENV live (no schedule rule)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /ImpactOnboardingLiveFunction/);
    assert.match(text, /a-search-impact-onboarding-live/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    const start = text.indexOf('ImpactOnboardingLiveFunction');
    assert.ok(start >= 0);
    const end = text.indexOf(');', start);
    assert.ok(end > start, 'expected live Function(...) block');
    const liveBlock = text.slice(start, end + 2);
    assert.match(liveBlock, /A_SEARCH_ENV:\s*'live'/);
    assert.doesNotMatch(liveBlock, /events\.Rule|Schedule\.rate|Schedule\.cron/);
    // FR-056c out of scope: no dedicated live Impact EventBridge rule id/name.
    assert.doesNotMatch(text, /ImpactOnboardingLiveSchedule|a-search-impact-onboarding-live-rule/);
    assert.match(text, /ImpactOnboardingLiveFunctionName/);
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

  it('npm run synth exits 0; template has impact live function + A_SEARCH_ENV live', () => {
    const r = runCdkSynth(root, { timeout: 180_000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const tpl = fs.readFileSync(templatePath, 'utf8');
    assert.match(tpl, /a-search-impact-onboarding-live/);
    const parsed = JSON.parse(tpl);
    const fns = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::Function',
    );
    const live = fns.find(
      (res) =>
        res.Properties &&
        res.Properties.FunctionName === 'a-search-impact-onboarding-live',
    );
    assert.ok(live, 'template must include a-search-impact-onboarding-live');
    assert.equal(live.Properties.Environment.Variables.A_SEARCH_ENV, 'live');
  });
});
