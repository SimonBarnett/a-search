'use strict';

/**
 * docs/mrb-1109: hostile pins for FR-133 Impact onboarding live EventBridge rule
 * (product PR #1109 / issue #969).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const gapPath = path.join(
  root,
  'docs',
  'release-gap-aws-installable-2026-10-09.md',
);
const fr133Test = path.join(
  root,
  'tests',
  'fr133-impact-onboarding-live-schedule.test.js',
);

function assertNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(
    !(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${path.relative(root, filePath)} must be UTF-8 without BOM`,
  );
}

describe('MRB #1109 hostile FR-133 impact onboarding live schedule', () => {
  it('stack keeps contiguous live schedule construct + output', () => {
    assert.ok(fs.existsSync(stackPath));
    assertNoBom(stackPath);
    assertNoBom(fr133Test);
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /ImpactOnboardingLiveSchedule/);
    assert.match(text, /ruleName:\s*'a-search-impact-onboarding-live'/);
    assert.match(
      text,
      /targets:\s*\[\s*new\s+targets\.LambdaFunction\(\s*impactOnboardingLive\s*\)/,
    );
    assert.match(text, /ImpactOnboardingLiveRuleName/);
    // Prior absence pins flipped (fr056c / mrb501).
    assert.match(
      fs.readFileSync(
        path.join(root, 'tests', 'mrb501-hostile-impact-onboarding-live.test.js'),
        'utf8',
      ),
      /assert\.match\(\s*text,\s*\/ImpactOnboardingLiveSchedule\//,
    );
    assert.doesNotMatch(
      fs.readFileSync(
        path.join(root, 'tests', 'fr056c-impact-onboarding-live-cdk.test.js'),
        'utf8',
      ),
      /doesNotMatch\(\s*text,\s*\/ImpactOnboardingLiveSchedule/,
    );
  });

  it('release-gap no longer claims impact live EventBridge missing', () => {
    assertNoBom(gapPath);
    const gap = fs.readFileSync(gapPath, 'utf8');
    assert.match(gap, /FR-133/);
    assert.doesNotMatch(
      gap,
      /impact \*\*live\*\* EventBridge rule \*\*missing\*\*/,
    );
  });
});
