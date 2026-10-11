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

  // FR-062: disabled live stubs still require onboarding books (stay-dark).
  // aliexpress enabled by FR-169; skill still required for remaining stubs.
  const LIVE_STUB_IDS = ['bol'];
  const ONBOARDING_IDS = ['kelkoo', 'skimlinks', 'aliexpress', 'etsy', 'bol'];

  it('FR-062: each live stub/onboarding id has onboarding SKILL.md; stubs stay dark', () => {
    const { sources } = loadRegistry();
    for (const id of ONBOARDING_IDS) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, `registry missing ${id}`);
      const skill = onboardingSkillPath(s);
      assert.ok(
        fs.existsSync(skill),
        `missing onboarding for ${id}: ${path.relative(root, skill)}`,
      );
      const text = fs.readFileSync(skill, 'utf8');
      assert.match(text, /CAST IRON/i);
      assert.match(text, /SimonBarnett\/a-search/);
    }
    for (const id of LIVE_STUB_IDS) {
      const s = sources.find((x) => x.id === id);
      assert.equal(s.enabled.live, false, `${id} must stay dark live`);
      assert.equal(s.enabled.sandbox, false, `${id} must stay dark sandbox`);
    }
    const ae = sources.find((x) => x.id === 'aliexpress');
    assert.equal(ae.enabled.live, true, 'FR-169 enables aliexpress live');
    assert.equal(ae.enabled.sandbox, true, 'FR-169 enables aliexpress sandbox');
    const kk = sources.find((x) => x.id === 'kelkoo');
    assert.equal(kk.enabled.live, true, 'FR-167 enables kelkoo live');
    assert.equal(kk.enabled.sandbox, true, 'FR-167 enables kelkoo sandbox');
    const sk = sources.find((x) => x.id === 'skimlinks');
    assert.equal(sk.enabled.live, true, 'FR-168 enables skimlinks live');
    assert.equal(sk.enabled.sandbox, true, 'FR-168 enables skimlinks sandbox');
  });
});
