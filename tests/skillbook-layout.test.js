'use strict';

/**
 * FR-027 / vision S8+S9: per-folder skillbooks + caller a-search-endpoint skill.
 * npm test must fail if the caller skill is missing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registry = require('../providers/registry.json');

function assertSkillbook(folderRel, skillId) {
  const base = path.join(root, folderRel);
  assert.ok(fs.existsSync(path.join(base, 'AGENTS.md')), `${folderRel}/AGENTS.md`);
  const skill = path.join(base, '.grok', 'skills', skillId, 'SKILL.md');
  assert.ok(fs.existsSync(skill), `${skillId} SKILL.md`);
}

describe('FR-027 / S8 skillbook-layout', () => {
  it('entry and maintainer have AGENTS.md + a-search-* skill', () => {
    assertSkillbook('entry', 'a-search-entry');
    assertSkillbook('maintainer', 'a-search-maintainer');
  });

  it('every registry source folder has AGENTS.md + a-search-<id> skill', () => {
    assert.ok(Array.isArray(registry.sources));
    for (const s of registry.sources) {
      assertSkillbook(s.folder, `a-search-${s.id}`);
    }
  });
});

describe('FR-027 / S9 caller a-search-endpoint skill', () => {
  it('repo ships .grok/skills/a-search-endpoint/SKILL.md', () => {
    const skill = path.join(
      root,
      '.grok',
      'skills',
      'a-search-endpoint',
      'SKILL.md',
    );
    assert.ok(
      fs.existsSync(skill),
      'caller skill .grok/skills/a-search-endpoint/SKILL.md must exist',
    );
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /POST\s+\/search/i);
    assert.match(text, /JWT|Bearer/i);
    assert.match(text, /userId/);
  });
});
