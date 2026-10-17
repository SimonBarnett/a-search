'use strict';

/**
 * docs/mrb-2389: hostile pin docs/mrb migration NNN sync lesson.
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
  'a-search docs/mrb stacked on product tip: before PASS, sync migration NNN renumbers from the product tip (sibling collision fix) so docs tip does not reintroduce the old NNN file on squash';

describe('mrb2389 hostile docs/mrb migration NNN sync lesson', () => {
  it('SKILL.md contiguous docs/mrb migration sync lesson (ASCII no BOM)', () => {
    const raw = fs.readFileSync(SKILL);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
    const text = raw.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'missing contiguous lesson needle');
    const line = text.split(/\r?\n/).find((l) => l.includes('docs/mrb stacked on product tip: before PASS, sync migration'));
    assert.ok(line);
    assert.equal(line.includes('\u2014'), false);
    assert.equal(line.includes('\u2013'), false);
  });
});
