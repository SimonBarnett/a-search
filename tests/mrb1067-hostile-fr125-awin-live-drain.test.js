'use strict';

/** docs/mrb-1067: hostile pins for FR-125 Awin live HTTP onboarding drain (PR #1067). */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const runJs = path.join(
  root,
  'providers',
  'local',
  'awin',
  'onboarding',
  'src',
  'run.js',
);
const skill = path.join(
  root,
  'providers',
  'local',
  'awin',
  'onboarding',
  '.grok',
  'skills',
  'a-search-awin-onboarding',
  'SKILL.md',
);
const productTest = path.join(
  root,
  'tests',
  'fr125-awin-onboarding-live-drain.test.js',
);

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

describe('MRB #1067 hostile FR-125 awin live drain', () => {
  it('run.js live path uses fetchJoinedProgrammes; empty stub gone; fail-closed httpGet', () => {
    const t = read(runJs);
    assert.match(t, /fetchJoinedProgrammes/);
    assert.match(t, /missing_httpGet/);
    assert.match(t, /runLiveOnce|FR-125/);
    assert.doesNotMatch(
      t,
      /Live path not implemented[\s\S]{0,80}empty drain/i,
    );
    // Sandbox must still short-circuit before live HTTP.
    assert.match(t, /isSandbox/);
    assert.match(t, /runSandboxOnce/);
  });

  it('skillbook documents FR-125 injectable httpGet + fail-closed', () => {
    const t = read(skill);
    assert.match(t, /FR-125/);
    assert.match(t, /httpGet/);
    assert.match(t, /fails closed|missing_httpGet|no silent empty drain/i);
  });

  it('product FR-125 pin test remains on main with S13 drain + sandbox regression', () => {
    assert.ok(fs.existsSync(productTest), 'fr125 test missing');
    const t = read(productTest);
    assert.match(t, /remaining=0|remaining,\s*0/);
    assert.match(t, /batchSize/);
    assert.match(t, /drain/);
    assert.match(t, /sandbox still never calls httpGet|FR-050d/);
    assert.match(t, /missing_httpGet|fails closed/i);
  });

  it('FR-125 park Decision LOCKED on main', () => {
    const park = read(path.join(root, 'docs', 'fr', 'FR-125.md'));
    assert.match(park, /Decision \(LOCKED\)/);
    assert.match(park, /httpGet/);
    assert.match(park, /awin-joined-programmes\.json/);
  });
});
