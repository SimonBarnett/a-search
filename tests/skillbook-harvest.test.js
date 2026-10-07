'use strict';

/**
 * FR-046b: pin harvest needles for required agent CWDs.
 *
 * Full intake blurbs in every provider AGENTS/SKILL are separate FRs (OOS here).
 * This test:
 * - enumerates entry / maintainer / endpoint / enabled registry providers
 * - requires CAST IRON on each CWD AGENTS.md (+ primary skill where present)
 * - pins full harvest needles on foundation fixtures (root AGENTS, harvest skill,
 *   skillbook-layout) so removing them fails CI
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registry = require('../providers/registry.json');

const FULL_NEEDLES = [
  /CAST IRON/i,
  /\/bob\/v1\/intake|Report-BobiverseIntakeIssue/i,
  /SimonBarnett\/a-search/,
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assertExists(rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
}

function assertFullNeedles(rel) {
  const text = read(rel);
  for (const re of FULL_NEEDLES) {
    assert.match(text, re, `${rel} must match ${re}`);
  }
}

function assertCastIron(rel) {
  assertExists(rel);
  assert.match(read(rel), /CAST IRON/i, `${rel} must mention CAST IRON`);
}

function isSourceEnabled(s) {
  if (!s) return false;
  if (s.enabled === false) return false;
  if (s.enabled && typeof s.enabled === 'object') {
    return !!(s.enabled.live || s.enabled.sandbox);
  }
  return s.enabled !== false;
}

function enabledSources() {
  assert.ok(Array.isArray(registry.sources), 'registry.sources');
  return registry.sources.filter(isSourceEnabled);
}

describe('FR-046b skillbook-harvest', () => {
  it('foundation fixtures keep full harvest needles', () => {
    assertFullNeedles('AGENTS.md');
    assertFullNeedles('docs/skillbook-layout.md');
    assertFullNeedles(
      path.join('.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
    );
  });

  it('enumerates entry, maintainer, endpoint, enabled providers', () => {
    const cwdAgents = [
      path.join('entry', 'AGENTS.md'),
      path.join('maintainer', 'AGENTS.md'),
    ];
    const cwdSkills = [
      path.join('entry', '.grok', 'skills', 'a-search-entry', 'SKILL.md'),
      path.join(
        'maintainer',
        '.grok',
        'skills',
        'a-search-maintainer',
        'SKILL.md',
      ),
      path.join('.grok', 'skills', 'a-search-endpoint', 'SKILL.md'),
    ];

    for (const rel of cwdAgents.concat(cwdSkills)) {
      assertCastIron(rel);
    }

    const enabled = enabledSources();
    assert.ok(enabled.length > 0, 'expected enabled registry sources');
    for (const s of enabled) {
      assert.ok(s.folder, `source ${s.id} needs folder`);
      assert.ok(s.id, 'source needs id');
      const agents = path.join(s.folder, 'AGENTS.md');
      const skill = path.join(
        s.folder,
        '.grok',
        'skills',
        `a-search-${s.id}`,
        'SKILL.md',
      );
      assertCastIron(agents);
      assertCastIron(skill);
    }
  });

  it('fail-when: removing intake needle from root AGENTS is detected', () => {
    // Sanity: the positive pin above already matches; this guards the regex.
    const text = read('AGENTS.md');
    assert.match(text, /\/bob\/v1\/intake|Report-BobiverseIntakeIssue/i);
    assert.doesNotMatch(
      text.replace(/POST https:\/\/irc\.ntsa\.uk\/bob\/v1\/intake/g, 'POST REMOVED'),
      /\/bob\/v1\/intake/,
    );
  });
});
