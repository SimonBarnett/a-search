'use strict';

/**
 * docs/mrb-2377 hostile pin: CI test-and-synth on self-hosted a-search runner;
 * fork PRs stay on ubuntu-latest; job id unchanged (required-ci-3948).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ciPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

describe('MRB-2377 ci whiterabbit self-hosted runner', () => {
  it('test-and-synth job id; fork ubuntu-latest; self-hosted a-search labels', () => {
    const text = fs.readFileSync(ciPath, 'utf8');
    assert.match(text, /test-and-synth:/);
    assert.match(text, /required-ci-3948|Job id must stay test-and-synth/);
    assert.match(text, /head\.repo\.fork == true/);
    assert.match(text, /ubuntu-latest/);
    assert.match(text, /self-hosted/);
    assert.match(text, /a-search/);
    assert.match(text, /fromJSON\(/);
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
  });
});
