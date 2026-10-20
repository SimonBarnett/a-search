'use strict';

/**
 * docs/mrb-4613: contiguous pin for nssm ObjectName harvest lesson (MRB #4613).
 * After fuller fold on main, pin the Register-WalrusSqlDrainService + INFO JSON bullet.
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

describe('docs/mrb-4613 hostile nssm ObjectName lesson', () => {
  it('pins contiguous ObjectName username+password skip playbook', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.match(
      text,
      /nssm ObjectName needs username\+password together: when -ServicePasswordFile omitted, Register-WalrusSqlDrainService skips ObjectName and prints interactive nssm set; drain emits one INFO JSON line per message \(searchid\/host\/guid\/productCount\/duration\/outcome\)/,
    );
  });
});
