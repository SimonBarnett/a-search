'use strict';

/**
 * FR-2314 / FR-2315: tip-loop close filter CAST IRON pins in harvest-agent-skills.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

function tipLoopBullet(text) {
  const lines = text.split(/\r?\n/);
  const line = lines.find(
    (l) =>
      l.includes('tip-loop close') &&
      l.includes('ExistingPrUrl') &&
      l.startsWith('- '),
  );
  assert.ok(line, 'tip-loop ExistingPrUrl close bullet present');
  return line;
}

describe('FR-2314 tip-loop close filter CAST IRON', () => {
  it('SKILL.md forbids bare pull/N substring match (example cites must not sweep)', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const text = buf.toString('utf8');
    const line = tipLoopBullet(text);
    assert.match(line, /never a bare pull\/N substring/i);
    assert.match(line, /Existing PR:/);
    assert.match(line, /exact title StartsWith/i);
    assert.match(line, /FR-2314|#2314/);
  });

  it('SKILL.md forbids treating product ExistingPrUrl as harvest twin (FR-2315)', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    const line = tipLoopBullet(text);
    assert.match(line, /harvest-lesson|lesson\(/i);
    assert.match(line, /product/i);
    assert.match(line, /FR-2315|#2315/);
  });
});