'use strict';

/** FR-060h: impact onboarding skillbook path + drain pointer needles */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRel = path.join(
  'providers',
  'local',
  'impact',
  '.grok',
  'skills',
  'a-search-impact-onboarding',
  'SKILL.md',
);
const drainSkillRel = path.join(
  'providers',
  'local',
  'impact',
  'onboarding',
  '.grok',
  'skills',
  'a-search-impact-onboarding',
  'SKILL.md',
);

describe('FR-060h impact onboarding skillbook', () => {
  it('provider skill has CAST IRON, MSSQL/campaign .env, drain pointer, selftest', () => {
    const p = path.join(root, skillRel);
    assert.ok(fs.existsSync(p), `missing ${skillRel}`);
    const text = fs.readFileSync(p, 'utf8');
    assert.match(text, /CAST IRON/i);
    assert.match(text, /MSSQL_SERVER|MSSQL_DATABASE/);
    assert.match(text, /IMPACT_CAMPAIGN_ID/);
    assert.match(text, /\.env/);
    assert.match(text, /sandbox/i);
    assert.match(text, /selftest/i);
    assert.match(
      text,
      /onboarding\/\.grok\/skills\/a-search-impact-onboarding|ImpactPendingOnboard|pending/i,
    );
    assert.match(text, /intake|SimonBarnett\/a-search/i);
    assert.doesNotMatch(text, /Stub for \*\*FR-060b\*\*/);
  });

  it('drain agent skill exists and AGENTS.md points at onboarding skill', () => {
    assert.ok(
      fs.existsSync(path.join(root, drainSkillRel)),
      `missing ${drainSkillRel}`,
    );
    const agents = fs.readFileSync(
      path.join(root, 'providers', 'local', 'impact', 'AGENTS.md'),
      'utf8',
    );
    assert.match(agents, /a-search-impact-onboarding/);
    assert.match(agents, /onboarding\//);
  });
});
