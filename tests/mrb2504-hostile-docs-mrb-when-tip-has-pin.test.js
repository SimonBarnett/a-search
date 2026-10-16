'use strict';

/**
 * MRB #2504: when docs/mrb offered but tip already has lesson+hostile+auto-merge, FAIL-supersede docs/mrb.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const NEEDLE =
  'When Jeeves offers docs/mrb-N but the harvest tip already carries the lesson bullet and hostile pin with auto-merge armed: FAIL-supersede/close the docs/mrb citing the tip URL --- do not land a second hostile filename.';

describe('MRB #2504 hostile docs/mrb-when-tip-has-pin lesson', () => {
  it('pins contiguous FAIL-supersede docs/mrb when tip already armed playbook', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'lesson must stay contiguous');
    assert.match(text, /When Jeeves offers docs\/mrb-N but the harvest tip already carries the lesson bullet/);
    assert.match(text, /hostile pin with auto-merge armed/);
    assert.match(text, /FAIL-supersede\/close the docs\/mrb citing the tip URL/);
    assert.match(text, /do not land a second hostile filename/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/, 'ASCII only');
  });
});