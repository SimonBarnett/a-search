'use strict';

/**
 * FR-1947: tip-loop close one PR number at a time; ExistingPrUrl twin filter.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillPath = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'a-search MRB tip-loop close after Invoke-BobiverseHarvest -ExistingPrUrl: close twins one `gh pr close <N>` at a time; select only PRs whose body cites the exact line `Existing PR: <url>` for this job or exact title StartsWith of the harvest lesson; never a bare pull/N substring (example prose in another tip body is not a twin; FR-2314); never pipe a multi-number Where-Object list into one `gh pr close` (gh exits too many arguments and a loose filter nearly swept unrelated open tips; FR-1947 / context MRB #1871)';

describe('FR-1947 tip-loop close one-at-a-time', () => {
  it('harvest-agent-skills SKILL.md has contiguous tip-loop close lesson (UTF-8 no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'FR-1947 tip-loop close lesson must stay contiguous');
    assert.ok(text.includes('never pipe a multi-number Where-Object list into one'));
    assert.ok(text.includes('too many arguments'));
    assert.ok(text.includes('exact title StartsWith'));
    assert.ok(text.includes('ExistingPrUrl') || text.includes('Existing PR pull/N'));
  });
});
