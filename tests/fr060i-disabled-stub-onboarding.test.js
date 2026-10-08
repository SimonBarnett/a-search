'use strict';

/**
 * FR-060i: disabled local stub providers get minimal onboarding skill stubs
 * Path: providers/local/<id>/.grok/skills/a-search-<id>-onboarding/SKILL.md
 */

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
];

function onboardingPath(id) {
  return path.join(
    root,
    'providers',
    'local',
    id,
    '.grok',
    'skills',
    `a-search-${id}-onboarding`,
    'SKILL.md',
  );
}

describe('FR-060i disabled stub onboarding skills', () => {
  for (const id of DISABLED_LOCAL) {
    it(`${id} has a-search-${id}-onboarding stub with CAST IRON + UNKNOWN/not enabled`, () => {
      const skill = onboardingPath(id);
      assert.ok(fs.existsSync(skill), skill);
      const text = fs.readFileSync(skill, 'utf8');
      assert.match(text, /CAST IRON/i, `${id}: CAST IRON`);
      assert.match(text, /intake/i, `${id}: intake`);
      assert.match(
        text,
        /POST https:\/\/irc\.ntsa\.uk\/bob\/v1\/intake/,
        `${id}: intake URL`,
      );
      assert.match(
        text,
        /-Repo SimonBarnett\/a-search/,
        `${id}: -Repo a-search`,
      );
      assert.match(text, /UNKNOWN/i, `${id}: UNKNOWN`);
      assert.match(text, /not enabled/i, `${id}: not enabled`);
      assert.match(text, /disabled stub/i, `${id}: disabled stub`);
      assert.match(text, /\.env/i, `${id}: .env deferred`);
      assert.match(text, /sandbox/i, `${id}: sandbox`);
      assert.match(text, /selftest/i, `${id}: selftest pointer`);

      const agents = path.join(root, 'providers', 'local', id, 'AGENTS.md');
      assert.ok(fs.existsSync(agents), agents);
      assert.match(
        fs.readFileSync(agents, 'utf8'),
        new RegExp(`a-search-${id}-onboarding`),
        `${id}: AGENTS points at onboarding`,
      );
    });
  }

  it('registry keeps these six disabled (live+sandbox false)', () => {
    const { loadRegistry } = require('../providers/loadRegistry');
    const { sources } = loadRegistry();
    for (const id of DISABLED_LOCAL) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, `registry missing ${id}`);
      assert.equal(s.enabled.live, false, `${id} live`);
      assert.equal(s.enabled.sandbox, false, `${id} sandbox`);
    }
  });
});
