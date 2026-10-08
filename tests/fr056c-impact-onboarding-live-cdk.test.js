'use strict';

/**
 * FR-056c: CDK a-search-impact-onboarding-live with A_SEARCH_ENV=live.
 * Schedules are out of scope (FR-056e).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056c CDK impact onboarding Lambda live', () => {
  it('stack declares ImpactOnboardingLive with A_SEARCH_ENV live (no schedule rule)', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /ImpactOnboardingLiveFunction/);
    assert.match(text, /a-search-impact-onboarding-live/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    const liveBlock = text.slice(
      text.indexOf('ImpactOnboardingLiveFunction'),
      text.indexOf('ImpactOnboardingLiveFunctionName') + 80,
    );
    assert.ok(liveBlock.length > 40, 'expected live function + output region');
    assert.doesNotMatch(liveBlock, /events\.Rule|Schedule\.rate|Schedule\.cron/);
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
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'synth'],
      { cwd: root, encoding: 'utf8', shell: true, timeout: 180_000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const tpl = fs.readFileSync(templatePath, 'utf8');
    assert.match(tpl, /a-search-impact-onboarding-live/);
    const parsed = JSON.parse(tpl);
    const fns = Object.values(parsed.Resources || {}).filter(
      (r) => r.Type === 'AWS::Lambda::Function',
    );
    const live = fns.find(
      (r) =>
        r.Properties &&
        r.Properties.FunctionName === 'a-search-impact-onboarding-live',
    );
    assert.ok(live, 'template must include a-search-impact-onboarding-live');
    assert.equal(live.Properties.Environment.Variables.A_SEARCH_ENV, 'live');
  });
});
