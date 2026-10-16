'use strict';

/**
 * FR-2766: revive FR-216 madeiradb docs-pin lesson in harvest-agent-skills (ASCII).
 * Lesson: assert madeiradb is read-only / Never modify madeiradb; do not doesNotMatch(/madeiradb/)
 * when Decision LOCKED names it as untouched.
 * Do not hard-pin closed tip PR numbers in the lesson text.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'a-search FR-216 docs pin: assert madeiradb is read-only / Never modify madeiradb, do not doesNotMatch(/madeiradb/) when the Decision LOCKED paragraph names it as untouched';

describe('FR-2766 harvest FR-216 madeiradb docs pin lesson', () => {
  it('harvest-agent-skills carries contiguous FR-216 madeiradb docs-pin lesson (ASCII)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false, 'SKILL.md must be UTF-8 no BOM');
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous FR-216 madeiradb docs-pin lesson');
    const line = text.split(/\r?\n/).find((l) => l.includes('FR-216 docs pin: assert madeiradb'));
    assert.ok(line, 'lesson line not found');
    assert.equal(line.includes('\u2014'), false, 'lesson line must not use em-dash');
    assert.equal(line.includes('\u2013'), false, 'lesson line must not use en-dash');
    assert.equal(/#1990|#2289/.test(line), false, 'lesson must not hard-pin closed tip PR numbers');
  });
});