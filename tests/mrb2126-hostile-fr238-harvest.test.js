'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const SKILL = path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
describe('docs/mrb-2126 FR-238 Woo harvest lesson', () => {
  it('pins contiguous HTTPS SSRF + wc-auth user_id + key_permissions + HTTP 400 map', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /FR-238: Woo connect requires HTTPS public host \(SSRF\)/);
    assert.match(text, /wc-auth user_id is FR-216 state/);
    assert.match(text, /reject non-read key_permissions/);
    assert.match(text, /keys_invalid\/invalid_key_permissions\/wc_probe_failed to HTTP 400/);
  });
});