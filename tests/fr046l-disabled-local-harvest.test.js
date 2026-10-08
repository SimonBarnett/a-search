'use strict';

/** FR-046l: disabled local stub providers CAST IRON harvest needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const DISABLED_LOCAL = [
  'partnerize',
  'webgains',
  'tradedoubler',
  'admitad',
  'flexoffers',
  'avantlink',
  'shopify',
  'wix',
  'woocommerce',
];

function assertHarvestNeedles(text, label) {
  assert.match(text, /CAST IRON/i, `${label}: CAST IRON`);
  assert.match(text, /intake/i, `${label}: intake`);
  assert.match(
    text,
    /POST https:\/\/irc\.ntsa\.uk\/bob\/v1\/intake/,
    `${label}: intake URL`,
  );
  assert.match(
    text,
    /-Repo SimonBarnett\/a-search/,
    `${label}: -Repo a-search`,
  );
  assert.match(text, /honesty box/i, `${label}: honesty box`);
  assert.match(
    text,
    /Report-BobiverseIntakeIssue\.ps1/,
    `${label}: Report-BobiverseIntakeIssue`,
  );
  assert.match(
    text,
    /Never park a-search product lessons under bobiverse/i,
    `${label}: wrong-book ban`,
  );
}

describe('FR-046l disabled local stub CAST IRON harvest', () => {
  for (const id of DISABLED_LOCAL) {
    it(`${id} AGENTS.md + a-search-${id} SKILL.md have harvest needles`, () => {
      const agents = path.join(root, 'providers', 'local', id, 'AGENTS.md');
      const skill = path.join(
        root,
        'providers',
        'local',
        id,
        '.grok',
        'skills',
        `a-search-${id}`,
        'SKILL.md',
      );
      assert.ok(fs.existsSync(agents), agents);
      assert.ok(fs.existsSync(skill), skill);
      assertHarvestNeedles(fs.readFileSync(agents, 'utf8'), `${id}/AGENTS.md`);
      assertHarvestNeedles(fs.readFileSync(skill, 'utf8'), `${id}/SKILL.md`);
    });
  }
});
