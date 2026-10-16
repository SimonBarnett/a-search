'use strict';

/**
 * docs/mrb-2452: hostile pin docs/hostile ambient stay-dark PASS lesson.
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
  'MRB docs/hostile tip: when CI fails only on unrelated stay-dark asserts that also fail on clean origin/main after an enable-FR, PASS the assigned head, file a separate FR for the stale asserts, arm auto-merge - do not FAIL the docs/mrb PR for main pre-existing red';

describe('mrb2452 hostile docs/hostile ambient stay-dark lesson', () => {
  it('SKILL.md contiguous docs/hostile ambient stay-dark lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('MRB docs/hostile tip: when CI fails only'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});
