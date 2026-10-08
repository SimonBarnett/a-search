'use strict';

/**
 * FR-056b: CDK awin onboarding Lambda sandbox (A_SEARCH_ENV=sandbox).
 * Schedules OOS (FR-056 parent / later slices).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-056b CDK awin onboarding Lambda sandbox', () => {
  it('stack source defines a-search-awin-onboarding-sandbox with A_SEARCH_ENV sandbox', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /a-search-awin-onboarding-sandbox/);
    assert.match(text, /AwinOnboardingSandbox/);
    assert.match(
      text,
      /providers[/\\]local[/\\]awin[/\\]onboarding[/\\]src|onboarding', 'src'|onboarding", "src"/,
    );
    // Sandbox env stamp near the awin onboarding function (not only maintainer)
    const idx = text.indexOf('a-search-awin-onboarding-sandbox');
    assert.ok(idx > 0, 'functionName missing');
    const window = text.slice(Math.max(0, idx - 400), idx + 500);
    assert.match(window, /A_SEARCH_ENV:\s*'sandbox'/);
    // Live sibling is a separate FR (#192 / FR-056a) — do not require it here
    assert.doesNotMatch(window, /A_SEARCH_ENV:\s*'live'/);
  });

  it('onboarding src exports Lambda handler wrapping runOnce', () => {
    const handlerPath = path.join(
      root,
      'providers',
      'local',
      'awin',
      'onboarding',
      'src',
      'handler.js',
    );
    assert.ok(fs.existsSync(handlerPath), 'missing handler.js');
    const { handler } = require(handlerPath);
    assert.equal(typeof handler, 'function');
  });
});
