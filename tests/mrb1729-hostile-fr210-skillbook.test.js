'use strict';

/**
 * MRB #1729 hostile pins for FR-210 components-piece skillbook.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const AGENTS = path.join(ROOT, 'components-piece', 'AGENTS.md');
const SKILL = path.join(
  ROOT,
  'components-piece',
  '.grok',
  'skills',
  'a-search-components-piece',
  'SKILL.md',
);
const FR = path.join(ROOT, 'docs', 'fr', 'FR-210.md');

describe('mrb1729 FR-210 components-piece skillbook hostile', () => {
  it('AGENTS + SKILL exist UTF-8 no-BOM with CAST IRON harvest needles', () => {
    for (const p of [AGENTS, SKILL, FR]) {
      const raw = fs.readFileSync(p);
      assert.notEqual(raw[0], 0xef, p + ' must be UTF-8 without BOM');
      for (const b of raw) assert.ok(b < 128, p + ' must be ASCII');
    }
    const agents = fs.readFileSync(AGENTS, 'utf8');
    const skill = fs.readFileSync(SKILL, 'utf8');
    for (const text of [agents, skill]) {
      assert.match(text, /CAST IRON/i);
      assert.match(text, /\/bob\/v1\/intake|Report-BobiverseIntakeIssue/i);
      assert.match(text, /SimonBarnett\/a-search/);
      assert.match(text, /harvest-agent-skills/);
    }
  });

  it('SKILL pins widgetGuid CWD rules and idle-no-tokens', () => {
    const skill = fs.readFileSync(SKILL, 'utf8');
    assert.match(skill, /widgetGuid/);
    assert.match(skill, /\{env\}\/x\/\{customerNumber\}\//);
    assert.match(skill, /\{env\}\/x\/\{customerNumber\}\/\{widgetGuid\}\//);
    assert.match(skill, /no tokens while idle|must not use tokens while idle|must not burn tokens while/i);
    assert.match(skill, /GET \/parts/);
    assert.match(skill, /GET \/go/);
    assert.match(skill, /feedback\.json/);
  });

  it('FR-210 Decision LOCKED lists skillbook deliverables', () => {
    const text = fs.readFileSync(FR, 'utf8');
    assert.match(text, /##\s*Decision\s*\(?LOCKED\)?/i);
    assert.match(text, /components-piece\//);
    assert.match(text, /a-search-components-piece/);
    assert.match(text, /widgetGuid/);
  });
});
