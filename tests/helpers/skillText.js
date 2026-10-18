'use strict';

/**
 * FR #3611: harvest SKILL.md pins must not fail solely because the file is CRLF.
 * Prefer includes() on newline-normalized text over assert.match with literal \\n.
 */

const fs = require('node:fs');
const assert = require('node:assert/strict');

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * @param {string} skillPath
 * @returns {{ buf: Buffer, text: string, normalized: string }}
 */
function readSkillUtf8(skillPath) {
  const buf = fs.readFileSync(skillPath);
  const text = buf.toString('utf8');
  return { buf, text, normalized: normalizeNewlines(text) };
}

/**
 * Contiguous needle pin (ASCII-safe). Fails with a clear message when missing.
 * @param {string} skillPath
 * @param {string} needle
 * @param {string} [label]
 */
function assertSkillIncludes(skillPath, needle, label) {
  const { buf, normalized } = readSkillUtf8(skillPath);
  assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM on ' + skillPath);
  assert.ok(
    normalized.includes(needle),
    (label || 'skill pin') + ' missing needle after CRLF normalize: ' + needle,
  );
}

module.exports = {
  normalizeNewlines,
  readSkillUtf8,
  assertSkillIncludes,
};
