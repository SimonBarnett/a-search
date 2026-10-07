'use strict';

/** Hostile pins for FR-046b / MRB #374 — skillbook-harvest.test.js */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const testPath = path.join(root, 'tests', 'skillbook-harvest.test.js');

describe('hostile MRB #374 FR-046b skillbook-harvest', () => {
  it('test enumerates entry/maintainer/endpoint and enabled registry', () => {
    assert.ok(fs.existsSync(testPath));
    const src = fs.readFileSync(testPath, 'utf8');
    assert.match(src, /path\.join\('entry'/);
    assert.match(src, /maintainer/);
    assert.match(src, /a-search-endpoint/);
    assert.match(src, /registry\.json|registry\.sources/);
    // enabled.live || s.enabled.sandbox (object flags)
    assert.match(src, /enabled\.live\s*\|\|/);
    assert.match(src, /enabled\.sandbox/);
    assert.match(src, /FULL_NEEDLES|\/bob\/v1\/intake/);
    assert.doesNotMatch(src, /<<<<<<<|=======|>>>>>>>/);
  });

  it('suite still passes offline', () => {
    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    assert.match(agents, /CAST IRON/i);
    assert.match(agents, /\/bob\/v1\/intake|Report-BobiverseIntakeIssue/i);
    assert.match(agents, /SimonBarnett\/a-search/);
  });
});
