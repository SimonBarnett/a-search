'use strict';

/**
 * FR-1955: docs/mrb worktree unique local branch -mh{seat} when head locked.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'a-search MRB docs/mrb worktree: when git worktree add fails because branch docs/mrb-N-hostile is already checked out in a stale docs-mrb-a-search-N tree, use a unique local branch suffix -mh{seat} (git worktree add -B docs/mrb-N-hostile-mh{seat} <path> origin/pr-N) then push HEAD:docs/mrb-N-hostile; optionally Clear-BobiverseJobWorktrees for abandoned trees; never force-remove another seat marked worktree (FR-1955 / context MRB #1799)';

describe('FR-1955 docs/mrb unique local branch', () => {
  it('harvest-agent-skills SKILL.md has contiguous unique-branch lesson (UTF-8 no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'FR-1955 unique-branch lesson must stay contiguous');
    assert.ok(text.includes('unique local branch suffix -mh{seat}'));
    assert.ok(text.includes('Clear-BobiverseJobWorktrees'));
    assert.ok(text.includes('never force-remove another seat'));
    assert.ok(text.includes('docs/mrb-N-hostile'));
  });
});
