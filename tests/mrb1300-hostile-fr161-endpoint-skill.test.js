'use strict';

/** Hostile pins for MRB #1300 / FR-161 endpoint skill SearchApiUrl + smoke. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'a-search-endpoint', 'SKILL.md');
const fr = path.join(root, 'docs', 'fr', 'FR-161.md');
const gap = path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md');

describe('MRB-1300 hostile FR-161 endpoint skill deploy smoke', () => {
  it('skill contiguous SearchApiUrl + smoke-deploy + never print JWT', () => {
    const text = fs.readFileSync(skill, 'utf8');
    assert.ok(text.includes('## Deploy URL + smoke (FR-161 / FR-144)'));
    assert.ok(text.includes('SearchApiUrl'));
    assert.ok(text.includes('smoke-deploy'));
    assert.ok(text.includes('A_SEARCH_SMOKE_JWT'));
    assert.ok(text.includes('never commit the JWT'));
    assert.ok(!text.startsWith('\uFEFF'));
  });

  it('Decision LOCKED and release-gap Yes for FR-161', () => {
    const frText = fs.readFileSync(fr, 'utf8');
    assert.ok(frText.includes('## Decision (LOCKED)'));
    const gapText = fs.readFileSync(gap, 'utf8');
    assert.match(
      gapText,
      /Endpoint skill deploy pointers \| FR-161 \| #1004 \(\*\*Yes\*\* - skill SearchApiUrl \+ FR-144 smoke; pin fr161\)/,
    );
  });
});

