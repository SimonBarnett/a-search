'use strict';

/**
 * docs/mrb-4619: hostile pin for harvest-agent-skills nssm ObjectName +
 * walrus drain INFO JSON lesson (PR #4619 / FR #4570).
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

describe('MRB #4619 hostile nssm ObjectName + drain INFO harvest lesson', () => {
  it('Harvested lessons keep contiguous fuller ObjectName + INFO tip', () => {
    const text = fs.readFileSync(skill, 'utf8');
    const needle =
      'Register-WalrusSqlDrainService skips ObjectName';
    const i = text.indexOf(needle);
    assert.ok(i >= 0, 'missing Register-WalrusSqlDrainService ObjectName lesson');
    const window = text.slice(i - 80, i + 280);
    assert.match(window, /ServicePasswordFile omitted/);
    assert.match(window, /INFO JSON line per message/);
    assert.match(window, /productCount/);
    assert.match(window, /duration\/outcome/);
    assert.equal((text.match(/nssm ObjectName needs username\+password together/g) || []).length, 1);
    assert.doesNotMatch(window, /\u2014/);
    const raw = fs.readFileSync(skill);
    assert.equal(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf, false);
  });
});
