'use strict';

/**
 * FR-024 maintainer schedules — superseded in CDK by FR-3949 (walrus).
 * Staging helpers may remain; stack no longer deploys maintainer Lambdas.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ensureDefaultStackSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');

describe('FR-024 EventBridge maintainer schedules (removed FR-3949)', () => {
  it('stack no longer has MaintainerLive/Sandbox Lambdas or 15m schedules', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.doesNotMatch(text, /MaintainerLiveFunction|MaintainerSandboxFunction/);
    assert.doesNotMatch(text, /a-search-maintainer-live|a-search-maintainer-sandbox/);
    assert.doesNotMatch(text, /stageMaintainerLambdaAsset/);
    assert.match(text, /FR-3949/);
    // Onboarding / widget still use EventBridge
    assert.match(text, /aws-events/);
    assert.match(text, /Schedule\.rate/);
  });

  it('synth template has no maintainer function names', () => {
    let cdk;
    try {
      cdk = require('aws-cdk-lib');
    } catch (err) {
      assert.match(String(err && err.message), /Cannot find module|aws-cdk-lib/);
      return;
    }
    void cdk;
    const { outDir } = ensureDefaultStackSynth(root);
    const tpl = fs.readFileSync(
      path.join(outDir, 'ASearchStack.template.json'),
      'utf8',
    );
    assert.doesNotMatch(tpl, /a-search-maintainer-live/);
    assert.doesNotMatch(tpl, /a-search-maintainer-sandbox/);
  });
});
