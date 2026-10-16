'use strict';

/**
 * docs/mrb-2267: pin harvest-agent-skills lesson for CONFLICTING tip
 * hundreds behind -> rebuild on main (context #2260 / #1541).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB-2267 harvest lesson CONFLICTING tip rebuild', () => {
  it('SKILL.md contiguous abort keep-both + rebuild on current main', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /CONFLICTING tip hundreds behind with open acceptance/,
    );
    assert.match(text, /abort keep-both/);
    assert.match(text, /one fix PR rebuild on current main/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
