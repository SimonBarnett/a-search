'use strict';

/** FR-046k: impact AGENTS + a-search-impact CAST IRON harvest needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const impact = path.join(__dirname, '..', 'providers', 'local', 'impact');
const agents = path.join(impact, 'AGENTS.md');
const skill = path.join(
  impact,
  '.grok',
  'skills',
  'a-search-impact',
  'SKILL.md',
);

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

describe('FR-046k impact CAST IRON harvest', () => {
  it('providers/local/impact/AGENTS.md has harvest + intake needles', () => {
    assert.ok(fs.existsSync(agents));
    assertHarvestNeedles(fs.readFileSync(agents, 'utf8'), 'AGENTS.md');
  });

  it('a-search-impact SKILL.md has harvest + intake needles', () => {
    assert.ok(fs.existsSync(skill));
    assertHarvestNeedles(fs.readFileSync(skill, 'utf8'), 'SKILL.md');
  });
});
