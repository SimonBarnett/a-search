'use strict';

/**
 * FR #4126: paste Merc Awin operator skillbook bodies into redqueen/awin-agent
 * skills; remove PENDING stubs; Simon decisions (Windows in-process sign-in,
 * 149-char join messages, AGENTS.md then awin/AGENT.md load order).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const agentRoot = path.join(root, 'redqueen', 'awin-agent');
const skillsRoot = path.join(agentRoot, '.grok', 'skills');

const SKILLS = [
  'a-search-awin-agent-publisher-signin',
  'a-search-awin-agent-welcome-monitor',
  'a-search-awin-agent-feed-link-pulls',
  'a-search-awin-agent-merchant-feed-key',
  'a-search-awin-agent-daily-signups',
  'a-search-awin-agent-global-recommendations',
  'a-search-awin-agent-invite-metrics',
  'a-search-awin-agent-nofeed-followup',
  'a-search-awin-agent-merc-hostile-mrb',
];

function read(rel) {
  return fs.readFileSync(path.join(agentRoot, rel), 'utf8');
}

function skillBody(name) {
  return fs.readFileSync(path.join(skillsRoot, name, 'SKILL.md'), 'utf8');
}

/** Reject join/invite messages at or over Awin's 150-char hard limit (cap 149). */
function assertInviteMessageLength(msg, limit = 149) {
  if (typeof msg !== 'string') throw new TypeError('message must be a string');
  if ([...msg].length > limit) {
    const err = new Error(`invite_message_too_long:${[...msg].length}>${limit}`);
    err.code = 'invite_message_too_long';
    throw err;
  }
  return true;
}

describe('FR #4126 Merc skillbook paste', () => {
  it('every a-search-awin-agent-* skill exists without PENDING from Merc', () => {
    for (const name of SKILLS) {
      const body = skillBody(name);
      assert.ok(body.length > 800, `${name} too short (still a stub?)`);
      assert.doesNotMatch(body, /PENDING from Merc/);
      assert.match(body, new RegExp(`^name:\\s*${name}`, 'm'));
      assert.match(body, /CAST IRON harvest/);
      assert.doesNotMatch(body, /\uFEFF/);
    }
  });

  it('publisher-signin documents redqueen in-process fill (no temp/clipboard)', () => {
    const body = skillBody('a-search-awin-agent-publisher-signin');
    assert.match(body, /Redqueen Windows sign-in/);
    assert.match(body, /in-process/i);
    assert.match(body, /C:\\passwords\\awin\.secret\.txt/);
    assert.match(body, /no temp file/i);
    assert.match(body, /clipboard/i);
    assert.match(body, /mfa-otp-challenge/);
  });

  it('global-recommendations enforces per-advertiser messages <= 149 chars', () => {
    const body = skillBody('a-search-awin-agent-global-recommendations');
    assert.match(body, /at most 149 characters/);
    assert.match(body, /unique/i);
    assert.doesNotMatch(body, /PENDING from Merc/);
    assert.equal(assertInviteMessageLength('x'.repeat(149)), true);
    assert.throws(
      () => assertInviteMessageLength('x'.repeat(150)),
      (e) => e && e.code === 'invite_message_too_long',
    );
  });

  it('AGENTS.md load order: affiliates AGENTS.md then awin/AGENT.md', () => {
    const agents = read('AGENTS.md');
    assert.match(agents, /a-affiliates\/AGENTS\.md/);
    assert.match(agents, /awin\/AGENT\.md/);
    const iGeneric = agents.indexOf('a-affiliates/AGENTS.md');
    const iAwin = agents.indexOf('awin/AGENT.md');
    assert.ok(
      iGeneric >= 0 && iAwin > iGeneric,
      'generic AGENTS.md must be listed before awin/AGENT.md',
    );
    assert.match(agents, /missing_agents_md/);
    assert.match(agents, /missing_provider_agent_md/);
    assert.match(agents, /149 characters/);
    assert.doesNotMatch(agents, /PENDING from Merc/);
  });

  it('README skillbooks section no longer says PENDING from Merc', () => {
    const readme = read('README.md');
    assert.doesNotMatch(readme, /PENDING from Merc/);
    assert.match(readme, /FR #4126/);
    assert.match(readme, /149 characters/);
    assert.match(readme, /in-process/);
  });
});
