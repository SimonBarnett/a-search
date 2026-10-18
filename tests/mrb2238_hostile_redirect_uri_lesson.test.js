'use strict';

/**
 * docs/mrb-2238: pin harvest-agent-skills lesson for extension login
 * redirect_uri allowlist MRB FAIL playbook (product fix #2236 / FR-2078).
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

describe('MRB-2238 harvest lesson redirect_uri allowlist', () => {
  it('SKILL.md contiguous allowlist + chromiumapp escape + SW claim gate', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'UTF-8 no BOM');
    const text = buf.toString('utf8');
    assert.match(
      text,
      /redirect_uri allowlist \(chromiumapp\.org \/ chrome-extension:\) before location\.assign/,
    );
    assert.ok(
      text.includes('chromiumapp') && text.includes('SW claim club gate on the one fix PR'),
      'chromiumapp + SW claim club gate contiguous lesson',
    );
    assert.match(text, /SW claim club gate on the one fix PR/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});