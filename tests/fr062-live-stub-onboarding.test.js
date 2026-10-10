'use strict';

/**
 * FR-062: live stub providers (disabled) must ship onboarding skillbooks.
 * Path: providers/live/<id>/.grok/skills/a-search-<id>-onboarding/SKILL.md
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

const LIVE_STUB_IDS = ['skimlinks', 'aliexpress', 'etsy', 'bol'];

function onboardingSkillPath(id) {
  return path.join(
    root,
    'providers',
    'live',
    id,
    '.grok',
    'skills',
    `a-search-${id}-onboarding`,
    'SKILL.md',
  );
}

describe('FR-062 live stub onboarding skillbooks', () => {
  it('each live stub id has a-search-<id>-onboarding/SKILL.md', () => {
    for (const id of LIVE_STUB_IDS) {
      const skill = onboardingSkillPath(id);
      assert.ok(
        fs.existsSync(skill),
        `missing onboarding skill for ${id}: ${path.relative(root, skill)}`,
      );
    }
  });

  it('each onboarding skill has CAST IRON harvest + -Repo SimonBarnett/a-search', () => {
    for (const id of LIVE_STUB_IDS) {
      const text = fs.readFileSync(onboardingSkillPath(id), 'utf8');
      assert.match(text, /CAST IRON/i, id);
      assert.match(text, /harvest/i, id);
      assert.match(text, /-Repo SimonBarnett\/a-search|SimonBarnett\/a-search/, id);
      assert.match(text, /\.env/i, id);
      assert.match(text, /sandbox/i, id);
      assert.match(text, /selftest/i, id);
      assert.match(text, /enabled\.live|not enabled|stay-?dark|disabled/i, id);
    }
  });

  it('registry keeps the four remaining live stubs enabled false for both envs', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of LIVE_STUB_IDS) {
      assert.ok(byId.has(id), `registry missing ${id}`);
      assert.equal(byId.get(id).enabled.live, false, `${id}.live`);
      assert.equal(byId.get(id).enabled.sandbox, false, `${id}.sandbox`);
    }
  });

  it('docs/provider-onboarding-skills.md lists the four remaining live stub ids', () => {
    const doc = fs.readFileSync(
      path.join(root, 'docs', 'provider-onboarding-skills.md'),
      'utf8',
    );
    assert.match(doc, /FR-062|live stub/i);
    for (const id of LIVE_STUB_IDS) {
      assert.match(doc, new RegExp(`\\b${id}\\b`), id);
    }
  });
});
