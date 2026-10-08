'use strict';
/**
 * 2026-10-08 incident: a-search harvests landed in SimonBarnett/bobiverse because seats ran
 * Invoke-BobiverseHarvest.ps1 without -Repo (default bobiverse). Pin the explicit -Repo
 * instruction and forbid routing a-search work lessons to bobiverse.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const INVOKE = /Invoke-BobiverseHarvest\.ps1 -Repo SimonBarnett\/a-search -Book harvest-agent-skills/;

describe('harvest repo is always SimonBarnett/a-search', () => {
  for (const rel of ['AGENTS.md', '.grok/skills/harvest-agent-skills/SKILL.md', 'docs/skillbook-layout.md']) {
    it(`${rel} pins Invoke-BobiverseHarvest -Repo SimonBarnett/a-search`, () => {
      const text = read(rel);
      assert.match(text, INVOKE);
      assert.match(text, /never[^\n]*without[^\n]*-Repo/i);
    });
  }

  it('foundation book does not send a-search MRB/CDK tips to bobiverse', () => {
    const text = read('.grok/skills/harvest-agent-skills/SKILL.md');
    assert.doesNotMatch(text, /Behind-main merge, docs\/mrb already-merged DONE PASS, CDK npm ci\/synth \| `SimonBarnett\/bobiverse`/);
    assert.match(text, /Bob fleet tooling only/);
  });
});
