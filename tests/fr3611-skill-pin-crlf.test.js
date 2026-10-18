'use strict';

/**
 * FR #3611: hostile SKILL pins must survive CRLF harvest-agent-skills files.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeNewlines,
  assertSkillIncludes,
} = require('./helpers/skillText');

const harvestSkill = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('FR-3611 skill pin CRLF safety', () => {
  it('literal \\n assert.match fails on CRLF while includes after normalize passes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3611-'));
    const p = path.join(dir, 'SKILL.md');
    const crlf = '- line one\r\n- line two FR #3478 a_search\r\n';
    fs.writeFileSync(p, crlf);
    const raw = fs.readFileSync(p, 'utf8');
    assert.throws(
      () => assert.match(raw, /line one\n- line two/),
      (err) =>
        err instanceof assert.AssertionError &&
        /did not match|does not match/i.test(String(err.message)),
      'fail-when: CRLF file still matches literal \\n regex',
    );
    const normalized = normalizeNewlines(raw);
    assert.ok(normalized.includes('line one\n- line two FR #3478 a_search'));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('harvest-agent-skills FR #3478 and FR #3611 bullets pin via CRLF-safe includes', () => {
    assertSkillIncludes(
      harvestSkill,
      'a-search FR #3478: wix providers/local/wix/.env.example live-target comment must name a_search (FR-251), not the read-only catalogue database',
      'FR #3478 wix env lesson',
    );
    assertSkillIncludes(
      harvestSkill,
      'a-search FR #3611: harvest SKILL hostile pins must use includes() or newline-normalize before assert.match; do not PASS when the pin suite is red on CRLF files',
      'FR #3611 CRLF pin lesson',
    );
  });

  it('helpers/skillText.js is the shared pin path (no BOM)', () => {
    const helper = path.join(__dirname, 'helpers', 'skillText.js');
    const buf = fs.readFileSync(helper);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.match(text, /normalizeNewlines/);
    assert.match(text, /assertSkillIncludes/);
  });
});
