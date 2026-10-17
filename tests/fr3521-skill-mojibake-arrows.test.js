'use strict';

/**
 * FR #3521: restore five mojibake lines in harvest-agent-skills to ASCII.
 * Do not touch the AKIA placeholder (issue 2746) or the real em dash on the
 * harvested GitGuardian bullet. Line numbers for the em dash / AKIA span move
 * when main appends lessons; find those by content.
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

const ASCII = {
  63: '`common/.grok/skills/harvest/SKILL.md` (wrong book - FAIL-supersede).',
  65: 'Branch `harvest/...` or `fix/...` -> PR to `main`.',
  90: '3. Open **many small** Goal / Deliverables / Testable FRs (one PR per issue) - **never**',
  93: '   `schedule.handler`** must orchestrate roll -> fetch -> upsert -> delete (not',
  102: '| Per-FR product playbooks (amazon handler, ebay Browse, etc.) | Owning `a-search-<id>` / maintainer / entry skill - already on main via product PRs; tip twins FAIL-supersede |',
};

describe('FR-3521 harvest-agent-skills mojibake arrows', () => {
  it('five named lines are clean ASCII; em dash and AKIA lines stay', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'no BOM');
    const lines = buf.toString('utf8').split(/\r?\n/);
    for (const [num, expected] of Object.entries(ASCII)) {
      const line = lines[Number(num) - 1];
      assert.equal(line, expected, `line ${num}`);
      assert.equal([...line].some((ch) => ch.charCodeAt(0) > 127), false);
    }
    const dash = lines.find((l) => l.includes('false positives') && l.includes('fix the fixture'));
    assert.ok(dash, 'GitGuardian false-positives bullet present');
    assert.equal(dash.includes('\u2014'), true, 'GitGuardian bullet keeps the real em dash');
    const akia = lines.find((l) => l.includes('AKIA'));
    assert.ok(akia, 'AKIA placeholder line present');
    assert.match(akia, /AKIA\.\.\.EXAMPLE/);
    assert.equal([...akia].some((ch) => ch.charCodeAt(0) > 127), false, 'AKIA span stays ASCII');
  });
});