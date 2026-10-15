'use strict';

/**
 * MRB #2219 hostile pins for FR-2021 CI concurrency + path-aware synth.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CI = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const SKILL = path.join(
  ROOT,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

describe('MRB #2219 hostile FR-2021 CI queue starvation', () => {
  it('job id test-and-synth unchanged; Synth gated; main push always synths', () => {
    const text = fs.readFileSync(CI, 'utf8');
    assert.match(text, /^\s*test-and-synth:\s*$/m);
    assert.match(text, /cancel-in-progress:\s*true/);
    assert.match(text, /if:\s*steps\.need_synth\.outputs\.synth == 'true'/);
    assert.match(text, /reason=main-push/);
    assert.match(text, /reason=docs-harvest-or-tests-only/);
    assert.match(
      text,
      /cdk\/\|providers\/\|entry\/\|maintainer\/\|shared\/\|components-piece\//,
    );
    assert.match(text, /package\(-lock\)\?\\?\.json/);
    // npm test is unconditional (no if: on Test step before Detect).
    assert.match(text, /- name: Test\r?\n\s+run: npm test/);
  });

  it('SKILL has FR-2021 lesson; no conflict markers; prior tip-loop/docs-mrb tips remain', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef);
    const text = buf.toString('utf8');
    assert.doesNotMatch(text, /^<<<<<<<|^=======|^>>>>>>>/m);
    assert.match(text, /FR-2021/);
    assert.match(text, /path-aware|concurrency|test-and-synth/i);
    assert.match(text, /FR-1947/);
    assert.match(text, /FR-1955/);
  });
});
