'use strict';

/**
 * MRB #5013: hostile pin for FR #4918 hasresults monitor harvest lesson.
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
  'FR #4918 hasresults monitor runs on redqueen: deterministic selection of hasresults=1 GUID markers, one locked agent cwd, clearHasResults only after exit 0 + live.json; agent promote+delete IN must not write hasresults; install via a-hasresults-monitor SEA + Register-HasresultsMonitorService.ps1.';

describe('MRB #5013 hostile FR #4918 hasresults monitor lesson', () => {
  it('SKILL.md UTF-8 no-BOM pure ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
  });

  it('pins contiguous hasresults monitor lesson', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FR #4918 lesson needle');
    assert.ok(text.includes('clearHasResults only after exit 0'));
    assert.ok(text.includes('a-hasresults-monitor'));
    assert.ok(text.includes('Register-HasresultsMonitorService.ps1'));
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
