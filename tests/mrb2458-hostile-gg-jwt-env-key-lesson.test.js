'use strict';

/**
 * docs/mrb-2458: hostile pin GitGuardian JWT env-key squash lesson (FR #3304).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'MRB when GitGuardian fails on an old tip commit for Generic High Entropy on JWT env reads: squash-force-push a single tip commit and assemble env key names from parts (FR #3304); tip-only edits cannot clear a multi-commit PR GG scan';

describe('mrb2458 hostile GitGuardian JWT env-key squash lesson', () => {
  it('SKILL.md contiguous GG High Entropy / FR #3304 lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('GitGuardian fails on an old tip commit'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
    assert.match(line, /FR #3304/);
    assert.match(line, /squash-force-push/);
  });
});
