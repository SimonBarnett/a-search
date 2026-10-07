'use strict';

/** FR-050e: awin onboarding skillbook clubscan URL + drain playbook */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(
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

const CLUBSCAN_TREE =
  'https://github.com/SimonBarnett/AWS/tree/main/Lambdas/madeira-awin-clubscan';
const CLUBSCAN_ONBOARDING_JS =
  'https://github.com/SimonBarnett/AWS/blob/main/Lambdas/madeira-awin-clubscan/routes/onboarding.js';

describe('FR-050e awin onboarding skillbook clubscan pointer', () => {
  it('SKILL.md exists at onboarding CWD skill path', () => {
    assert.ok(
      fs.existsSync(skillPath),
      `missing ${path.relative(root, skillPath).replace(/\\/g, '/')}`,
    );
  });

  it('documents clubscan tree URL and onboarding.js URL', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.ok(
      text.includes(CLUBSCAN_TREE),
      'skill must link madeira-awin-clubscan tree URL',
    );
    assert.ok(
      text.includes(CLUBSCAN_ONBOARDING_JS) ||
        text.includes('routes/onboarding.js'),
      'skill must point at clubscan routes/onboarding.js',
    );
    assert.match(text, /clubscan/i);
  });

  it('documents drain playbook until remaining=0', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /drain/i);
    assert.match(text, /remaining\s*(===|=)\s*0|remaining=0|remaining === 0/i);
    assert.match(text, /runOnce/i);
  });

  it('keeps CAST IRON harvest to SimonBarnett/a-search', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /SimonBarnett\/a-search/);
  });
});
