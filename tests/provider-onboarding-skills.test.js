'use strict';

/**
 * FR-060b: enabled registry providers must ship onboarding SKILL.md
 * Path: providers/<kind>/<id>/.grok/skills/a-search-<id>-onboarding/SKILL.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { loadRegistry } = require('../providers/loadRegistry');

/**
 * @param {{ id: string, kind: string, folder: string }} source
 * @returns {string}
 */
function onboardingSkillPath(source) {
  return path.join(
    root,
    source.folder,
    '.grok',
    'skills',
    `a-search-${source.id}-onboarding`,
    'SKILL.md',
  );
}

/**
 * Enabled for live OR sandbox (FR-060b enumerates enabled live+local).
 * @returns {Array<{ id: string, kind: string, folder: string, enabled: object }>}
 */
function enabledSources() {
  const { sources } = loadRegistry();
  return sources.filter(
    (s) =>
      s &&
      s.enabled &&
      (s.enabled.live === true || s.enabled.sandbox === true),
  );
}

describe('FR-060b provider onboarding skillbooks', () => {
  it('each enabled registry source has a-search-<id>-onboarding/SKILL.md', () => {
    const enabled = enabledSources();
    assert.ok(enabled.length > 0, 'expected at least one enabled source');
    for (const s of enabled) {
      const skill = onboardingSkillPath(s);
      assert.ok(
        fs.existsSync(skill),
        `missing onboarding skill for enabled ${s.id}: ${path.relative(root, skill)}`,
      );
      const text = fs.readFileSync(skill, 'utf8');
      assert.match(text, /a-search-|onboarding|CAST IRON/i);
    }
  });

  it('fail-when: removing amazon onboarding path would be detected', () => {
    const amazon = enabledSources().find((s) => s.id === 'amazon');
    assert.ok(amazon, 'amazon should be enabled in registry');
    const skill = onboardingSkillPath(amazon);
    assert.ok(fs.existsSync(skill), 'amazon onboarding must exist for this pin');
    // Document expected relative path pattern for reviewers / FR-060a contract.
    assert.equal(
      path.relative(root, skill).replace(/\\/g, '/'),
      'providers/live/amazon/.grok/skills/a-search-amazon-onboarding/SKILL.md',
    );
  });
});
