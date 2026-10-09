'use strict';

/**
 * docs/mrb-1130: hostile pin for harvest-agent-skills FR-137 CDK MSSQL lesson (PR #1130).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const skill = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB #1130 hostile harvest MSSQL CDK lesson', () => {
  it('Harvested lessons keep contiguous mssqlSecretArn / in-process synth tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const i = text.indexOf('CDK MSSQL_* wiring: fromSecretCompleteArn');
    assert.ok(i >= 0, 'missing CDK MSSQL_* wiring lesson');
    const window = text.slice(i, i + 420);
    assert.match(window, /mssqlSecretArn/);
    assert.match(window, /6-char suffix|complete ARN/i);
    assert.match(window, /SERVER/);
    assert.match(window, /PASSWORD/);
    assert.match(window, /in-process app\.synth\(\)|spawnSync/);
    assert.match(window, /local workers/);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
