'use strict';

/**
 * MRB #1180 hostile pin: FR-139 Ubuntu CI suite-debt harvest lesson contiguous ASCII.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'FR-139 Ubuntu CI: after POSIX run-tests + concurrency + vendored validate-vision-pack + FR-051b newUserId, remaining reds are stale hostile/harvest pins and release-gap drift -> file suite-debt FR; do not merge while Actions red';

test('mrb1180: FR-139 Ubuntu CI suite-debt lesson contiguous ASCII', () => {
  const raw = fs.readFileSync(SKILL);
  assert.equal(raw[0], 0x2d, 'SKILL.md UTF-8 no BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'suite-debt lesson must stay contiguous');
  assert.ok(text.includes('do not merge while Actions red'));
  assert.ok(text.includes('suite-debt FR'));
  assert.doesNotMatch(text, /drift \u00e2|drift \u2014/);
});
