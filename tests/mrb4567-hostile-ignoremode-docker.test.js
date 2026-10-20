'use strict';

/** docs/mrb-4567: pin harvest IgnoreMode.DOCKER lesson (MRB #4567). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('docs/mrb-4567 harvest IgnoreMode.DOCKER pin', () => {
  it('harvest-agent-skills pins CDK IgnoreMode.DOCKER for provider .env zips', () => {
    const p = path.join(
      __dirname,
      '..',
      '.grok',
      'skills',
      'harvest-agent-skills',
      'SKILL.md',
    );
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /IgnoreMode\.DOCKER/);
    assert.match(src, /IgnoreMode\.GIT/);
    assert.match(src, /providers\/live\/<id>\/\.env/);
    assert.match(src, /never print values/i);
  });
});
