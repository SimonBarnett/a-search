'use strict';

/**
 * FR #5225: offer-gap lesson --- a-search redeploy/monitor/CloudWatch/SQL-log
 * FRs need require_machine=redqueen; flamingo GIVEUP + file offer-gap intake.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(
  root,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const NEEDLE =
  'a-search FRs whose Required checklist needs redqueen redeploy of live workers/walrus, a-hasresults-monitor install, CloudWatch FilterLogEvents on a-search Lambdas, or a-sqlsearch/walrus logs must be stamped require_machine=redqueen; flamingo/marchhare ACK then GIVEUP (leave OPEN, comment); file offer-gap intake when the chair offered without a pin (class of #5221/#5225). Chair cue stamp lives in bobiverse gitclaim (Refs SimonBarnett/bobiverse#5030).';

describe('FR #5225 redqueen require_machine offer-gap lesson', () => {
  it('harvest-agent-skills SKILL.md has contiguous lesson (UTF-8 no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
    for (const b of buf) {
      assert.ok(b < 128, 'SKILL.md must stay pure ASCII (FR #4197)');
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'FR #5225 lesson must stay contiguous');
    assert.ok(text.includes('require_machine=redqueen'));
    assert.ok(text.includes('a-hasresults-monitor'));
    assert.ok(text.includes('FilterLogEvents'));
    assert.ok(text.includes('class of #5221/#5225'));
    assert.ok(text.includes('bobiverse#5030'));
  });
});
