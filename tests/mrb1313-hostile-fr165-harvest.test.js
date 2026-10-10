'use strict';

/** Hostile pin for MRB #1313 / FR-165 harvest-agent-skills memorySize lesson. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skill = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'Set explicit Lambda memorySize floors (entry 256, workers 256|512 for local/MSSQL) so cold JWKS/SDK do not OOM; document in deploy.md and synth-pin MemorySize (FR-165 / #1008).';

describe('MRB-1313 hostile FR-165 harvest memorySize lesson', () => {
  it('harvest-agent-skills contiguous FR-165 memorySize needle', () => {
    const text = fs.readFileSync(skill, 'utf8');
    assert.ok(text.includes(NEEDLE), 'missing FR-165 harvest needle');
    assert.ok(!text.startsWith('\uFEFF'));
  });
});
