'use strict';

/**
 * MRB #1245 docs/hostile: FR-139 Ubuntu CI harvest lesson (folded into intake bullet).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skillPath = path.join(
  root,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB #1245 hostile FR-139 Ubuntu CI harvest lesson', () => {
  it('skill has contiguous FR-139 Ubuntu CI playbook needles', () => {
    const text = fs.readFileSync(skillPath, 'utf8');
    assert.match(text, /## Harvested lessons \(intake\)/);
    assert.match(text, /FR-139 Ubuntu CI:/);
    assert.match(text, /run-tests\.js/);
    assert.match(text, /--test-concurrency=1/);
    assert.match(text, /validate-vision-pack\+setup-python|validate-vision-pack/);
    assert.match(text, /setup-python/);
    assert.match(text, /__no_such_source__/);
    assert.match(text, /fr058b/);
    assert.match(text, /mrb989\/mrb888|mrb989/);
    assert.match(text, /never merge while Actions red/);
    // No near-duplicate third FR-139 "green needs" bullet
    assert.doesNotMatch(text, /FR-139 Ubuntu CI green needs:/);
  });

  it('skill book UTF-8 no BOM for harvest tip hygiene', () => {
    const buf = fs.readFileSync(skillPath);
    assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false);
  });
});
