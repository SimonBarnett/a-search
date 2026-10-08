'use strict';

/** FR-060g: awin onboarding skillbook path + clubscan/drain needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'local',
  'awin',
  '.grok',
  'skills',
  'a-search-awin-onboarding',
  'SKILL.md',
);
const drainSkillRel = path.join(
  'providers',
  'local',
  'awin',
  'onboarding',
  '.grok',
  'skills',
  'a-search-awin-onboarding',
  'SKILL.md',
);

describe('FR-060g awin onboarding skillbook', () => {
  it('provider skill has CAST IRON, MSSQL/Awin .env, clubscan + drain pointers', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /MSSQL_SERVER|MSSQL_DATABASE/);
    assert.match(text, /AWIN_API_TOKEN|AWIN_PUBLISHER_ID/);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(text, /clubscan/i);
    assert.match(text, /madeira-awin-clubscan|onboarding\.js/);
    assert.match(text, /onboarding\/\.grok\/skills\/a-search-awin-onboarding|drain/i);
    assert.match(text, /intake|SimonBarnett\/a-search/i);
    assert.doesNotMatch(text, /Stub for \*\*FR-060b\*\*/);
  });

  it('drain agent skill exists and AGENTS.md points at onboarding skill', () => {
    assert.ok(
      fs.existsSync(path.join(root, drainSkillRel)),
      `missing ${drainSkillRel}`,
    );
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'local', 'awin', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-awin-onboarding/);
    assert.match(agents, /onboarding\//);
  });
});
