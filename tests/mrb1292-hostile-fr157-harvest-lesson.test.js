'use strict';

/**
 * docs/mrb-1292: hostile pins for FR-157 harvest lesson on harvest-agent-skills.
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

describe('docs/mrb-1292 FR-157 harvest lesson pins', () => {
  it('SKILL.md carries contiguous FR-157 HttpApi access logs lesson', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(
      text,
      /FR-157 HttpApi access logs: createDefaultStage false \+ HttpStage \$default with LogGroupLogDestination CLF and resolveApiThrottle context apiThrottleRate\/Burst \(defaults 20\/40\)/,
    );
    assert.match(text, /after FR-151 jose must be in node_modules before in-process synth pins/);
  });

  it('SKILL.md is UTF-8 without BOM and ASCII-only on the FR-157 bullet', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const line = buf
      .toString('utf8')
      .split(/\r?\n/)
      .find((l) => l.includes('FR-157 HttpApi access logs'));
    assert.ok(line, 'FR-157 lesson line present');
    for (let i = 0; i < line.length; i += 1) {
      assert.ok(line.charCodeAt(i) < 128, `non-ASCII at ${i}: ${line.charCodeAt(i)}`);
    }
  });
});