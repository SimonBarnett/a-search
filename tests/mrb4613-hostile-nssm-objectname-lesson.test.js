'use strict';

/**
 * docs/mrb-4613: contiguous pin for nssm ObjectName harvest lesson (MRB #4613).
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
      /nssm ObjectName needs username\+password together: when -ServicePasswordFile is omitted, skip the ObjectName call and print the exact interactive nssm set step; never call ObjectName with username alone\./,
    );
  });
});
