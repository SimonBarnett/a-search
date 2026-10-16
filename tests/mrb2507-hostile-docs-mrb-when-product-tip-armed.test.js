'use strict';

/**
 * MRB #2507: docs/mrb while product tip already has hostile+auto-merge -> FAIL-supersede docs/mrb.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'docs/mrb offered while product tip already carries hostile + auto-merge: FAIL-supersede/close the docs/mrb citing the tip; leave ambient fr106/108 wix stay-dark keep-green on the product tip (comment), do not restack product into a second CONFLICTING PR.';

describe('MRB #2507 hostile docs/mrb-when-product-tip-armed lesson', () => {
  it('pins contiguous product-tip-armed FAIL-supersede docs/mrb playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /docs\/mrb offered while product tip already carries hostile \+ auto-merge/);
    assert.match(text, /FAIL-supersede\/close the docs\/mrb citing the tip/);
    assert.match(text, /leave ambient fr106\/108 wix stay-dark keep-green/);
    assert.match(text, /do not restack product into a second CONFLICTING PR/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/, 'ASCII only');
  });
});