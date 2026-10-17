'use strict';

/**
 * FR #3726: do not DONE an MRB fold until the pushed SHA is the remote head.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skillPath = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'MRB behind-main fold: if git push of the fold is rejected, do not DONE on the pre-fold SHA; retry the push and DONE only after headRefOid matches the fold commit (class of #3726 / #3357).';

describe('FR #3726 fold push before DONE', () => {
  it('pins contiguous rejected-push playbook (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FR #3726 fold-push bullet missing');
    assert.match(text, /do not DONE on the pre-fold SHA/);
    assert.match(text, /headRefOid matches the fold commit/);
    assert.match(text, /#3726/);
    assert.match(text, /#3357/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });
});
