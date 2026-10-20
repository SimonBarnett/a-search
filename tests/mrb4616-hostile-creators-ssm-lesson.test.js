'use strict';

/**
 * docs/mrb-4616: contiguous pin for Amazon Creators SSM harvest lesson (MRB #4616).
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

describe('docs/mrb-4616 hostile Creators SSM lesson', () => {
  it('pins contiguous Creators SSM kebab-case optional-row playbook', () => {
    const text = fs.readFileSync(SKILL, 'utf8');
    assert.match(
      text,
      /Amazon Creators SSM follows madeira kebab-case optional row \(\/madeira\/amazon\/creators-credential\), same PatternNotFound skip as ebay refresh-token; document in secrets-matrix\./,
    );
  });
});
