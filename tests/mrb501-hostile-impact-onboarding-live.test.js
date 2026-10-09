'use strict';

/**
 * MRB #501 hostile pins: FR-056c live Impact onboarding Lambda coexists with
 * sandbox (FR-056d). Live EventBridge rule is FR-133.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('MRB #501 hostile Impact onboarding live', () => {
  it('stack keeps live + sandbox Impact functions with fixed A_SEARCH_ENV', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /a-search-impact-onboarding-live/);
    assert.match(text, /a-search-impact-onboarding-sandbox/);
    assert.match(text, /ImpactOnboardingLiveFunction/);
    assert.match(text, /ImpactOnboardingSandboxFunction/);
    assert.doesNotMatch(text, /<<<<<<<|>>>>>>>/);
    // FR-133: live Impact schedule present (see fr133-impact-onboarding-live-schedule.test.js).
    assert.match(text, /ImpactOnboardingLiveSchedule/);
  });

  it('synth template includes live Impact Lambda with A_SEARCH_ENV=live', () => {
    const r = runCdkSynth(root, { timeout: 180_000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const parsed = JSON.parse(
      fs.readFileSync(path.join(root, 'cdk.out', 'ASearchStack.template.json'), 'utf8'),
    );
    const fns = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::Function',
    );
    const live = fns.find(
      (res) => res.Properties && res.Properties.FunctionName === 'a-search-impact-onboarding-live',
    );
    const sandbox = fns.find(
      (res) =>
        res.Properties &&
        res.Properties.FunctionName === 'a-search-impact-onboarding-sandbox',
    );
    assert.ok(live, 'live Impact onboarding Lambda missing from template');
    assert.ok(sandbox, 'sandbox Impact onboarding Lambda missing from template');
    assert.equal(live.Properties.Environment.Variables.A_SEARCH_ENV, 'live');
    assert.equal(sandbox.Properties.Environment.Variables.A_SEARCH_ENV, 'sandbox');
  });
});
