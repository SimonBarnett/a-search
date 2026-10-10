'use strict';

/**
 * FR-161: a-search-endpoint skill documents SearchApiUrl + FR-144 smoke.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skill = path.join(
  root,
  '.grok',
  'skills',
  'a-search-endpoint',
  'SKILL.md',
);

describe('FR-161 a-search-endpoint deploy URL + smoke pointers', () => {
  it('skill exists and is ASCII / no BOM', () => {
    assert.ok(fs.existsSync(skill), 'missing a-search-endpoint SKILL.md');
    const buf = fs.readFileSync(skill);
    assert.ok(!(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf), 'BOM');
    const text = buf.toString('utf8');
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(text),
      'a-search-endpoint SKILL.md must be ASCII',
    );
  });

  it('skill needles: SearchApiUrl, deploy.md, smoke-deploy, FR-144, live|sandbox', () => {
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text, /SearchApiUrl/);
    assert.match(text, /docs\/deploy\.md/);
    assert.match(text, /smoke-deploy|scripts\/smoke-deploy\.js/);
    assert.match(text, /FR-144/);
    assert.match(text, /FR-161/);
    assert.match(text, /A_SEARCH_API_URL/);
    assert.match(text, /A_SEARCH_SMOKE_JWT/);
    assert.match(text, /A_SEARCH_URL_LIVE/);
    assert.match(text, /A_SEARCH_URL_SANDBOX/);
    assert.match(text, /live/i);
    assert.match(text, /sandbox/i);
    assert.match(
      text,
      /aws cloudformation describe-stacks|OutputKey=='SearchApiUrl'/,
    );
  });

  it('FR-161 Decision LOCKED + release-gap Yes', () => {
    const fr = fs.readFileSync(
      path.join(root, 'docs', 'fr', 'FR-161.md'),
      'utf8',
    );
    assert.match(fr, /Decision\s*\(?\s*LOCKED\)?/i);
    assert.match(fr, /fr161-endpoint-skill-deploy-smoke\.test\.js/);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(fr),
      'FR-161.md must be ASCII',
    );
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /Endpoint skill deploy pointers[^\n]*FR-161[^\n]*\*\*Yes\*\*/i,
    );
  });
});
