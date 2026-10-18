'use strict';

/**
 * docs/mrb-4245 hostile: Redqueen GrokHome LocalSystem harvest lesson contiguous.
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
  'Redqueen grok reviewers: prefer LocalSystem plus a dedicated -GrokHome ACL\'d to SYSTEM and Administrators; Administrator profile auth.json is Access is denied, not DPAPI. Skip the live Set-Acl test unless the process is elevated.';

describe('MRB #4245 hostile GrokHome harvest lesson', () => {
  it('lesson contiguous ASCII; SKILL no BOM / no non-ASCII', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    for (let i = 0; i < buf.length; i++) {
      assert.ok(buf[i] < 128, 'non-ASCII at ' + i);
    }
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous GrokHome / Set-Acl lesson');
    assert.ok(text.includes('Set-Acl'), 'Set-Acl elevated skip');
    assert.ok(text.includes('Access is denied'), 'Access is denied');
    assert.equal(text.includes('\u2014'), false, 'no em-dash');
  });
});
