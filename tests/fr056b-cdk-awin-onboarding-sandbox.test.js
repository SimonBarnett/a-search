'use strict';

/**
 * FR-056b: CDK awin onboarding Lambda sandbox (A_SEARCH_ENV=sandbox).
 * Schedules OOS (FR-056 parent / later slices).
 * MRB #503 hostile: synth template pin + UTF-8 no-BOM.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runCdkSynth } = require('./helpers/runCdkSynth');

const root = path.join(__dirname, '..');
const stackPath = path.join(root, 'cdk', 'lib', 'a-search-stack.js');
const handlerPath = path.join(
  root,
  'providers',
  'local',
  'awin',
  'onboarding',
  'src',
  'handler.js',
);

function assertNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.ok(
    !(buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf),
    `${path.relative(root, filePath)} must be UTF-8 without BOM`,
  );
}

describe('FR-056b CDK awin onboarding Lambda sandbox', () => {
  it('stack source defines a-search-awin-onboarding-sandbox with A_SEARCH_ENV sandbox', () => {
    const text = fs.readFileSync(stackPath, 'utf8');
    assert.match(text, /a-search-awin-onboarding-sandbox/);
    assert.match(text, /AwinOnboardingSandbox/);
    assert.match(text, /awin[\s',"]+onboarding/s);
    const idx = text.indexOf("functionName: 'a-search-awin-onboarding-sandbox'");
    assert.ok(idx > 0, 'functionName missing');
    const window = text.slice(idx, idx + 350);
    assert.match(window, /A_SEARCH_ENV:\s*'sandbox'/);
    assert.doesNotMatch(window, /A_SEARCH_ENV:\s*'live'/);
  });

  it('onboarding src exports Lambda handler wrapping runOnce (no BOM)', () => {
    assert.ok(fs.existsSync(handlerPath), 'missing handler.js');
    assertNoBom(handlerPath);
    assertNoBom(path.join(root, 'tests', 'fr056b-cdk-awin-onboarding-sandbox.test.js'));
    const { handler } = require(handlerPath);
    assert.equal(typeof handler, 'function');
  });

  it('npm run synth exits 0; template has sandbox function + A_SEARCH_ENV sandbox', () => {
    const r = runCdkSynth(root);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const templatePath = path.join(root, 'cdk.out', 'ASearchStack.template.json');
    assert.ok(fs.existsSync(templatePath), 'synth must emit ASearchStack.template.json');
    const parsed = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    const fns = Object.values(parsed.Resources || {}).filter(
      (res) => res.Type === 'AWS::Lambda::Function',
    );
    const sandbox = fns.find(
      (res) =>
        res.Properties &&
        res.Properties.FunctionName === 'a-search-awin-onboarding-sandbox',
    );
    assert.ok(sandbox, 'template must include a-search-awin-onboarding-sandbox');
    assert.equal(
      sandbox.Properties.Environment.Variables.A_SEARCH_ENV,
      'sandbox',
    );
  });
});
