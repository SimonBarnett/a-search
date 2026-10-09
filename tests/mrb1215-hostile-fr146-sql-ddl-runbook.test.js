'use strict';

/**
 * MRB #1215 hostile pin: FR-146 sandbox DB + DDL apply runbook needles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RUNBOOK = path.join(ROOT, 'docs', 'sql', 'apply-ddl-runbook.md');
const PIN = path.join(ROOT, 'tests', 'fr146-sql-ddl-runbook.test.js');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-146.md');
const GAP = path.join(ROOT, 'docs', 'release-gap-aws-installable-2026-10-09.md');
const ENV = path.join(ROOT, 'docs', 'environments.md');
const MAINT = path.join(ROOT, 'maintainer', 'sql', 'README.md');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1215.md');

function readUtf8NoBomAscii(p) {
  const raw = fs.readFileSync(p);
  assert.notEqual(raw[0], 0xef, path.basename(p) + ' must be UTF-8 without BOM');
  for (let i = 0; i < raw.length; i++) {
    assert.ok(raw[i] < 128, path.basename(p) + ' must stay ASCII (byte ' + raw[i] + ' at ' + i + ')');
  }
  return raw.toString('utf8');
}

describe('MRB-1215 hostile FR-146 DDL runbook', () => {
  it('apply-ddl-runbook documents a_search_sandbox + 001-003 + no secrets', () => {
    const text = readUtf8NoBomAscii(RUNBOOK);
    assert.ok(text.includes('FR-146'));
    assert.ok(text.includes('a_search_sandbox'));
    assert.ok(text.includes('RECOVERY SIMPLE'));
    assert.ok(text.includes('madeiradb'));
    assert.ok(text.includes('001_PartFeedKeys.sql'));
    assert.ok(text.includes('002_Parts.sql'));
    assert.ok(text.includes('003_PartsStaging.sql'));
    assert.ok(text.includes('sqlcmd'));
    assert.doesNotMatch(text, /password\s*=\s*['"][^'"]+['"]/i);
  });

  it('Decision LOCKED + pin + env/maintainer pointers', () => {
    assert.ok(fs.existsSync(PIN));
    const fr = readUtf8NoBomAscii(FR);
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.ok(fr.includes('a_search_sandbox'));
    assert.ok(fr.includes('fr146-sql-ddl-runbook.test.js'));

    const env = fs.readFileSync(ENV, 'utf8');
    assert.ok(env.includes('a_search_sandbox'));
    assert.ok(env.includes('apply-ddl-runbook.md'));
    assert.ok(env.includes('FR-146'));

    const maint = fs.readFileSync(MAINT, 'utf8');
    assert.ok(maint.includes('apply-ddl-runbook.md'));
    assert.ok(maint.includes('FR-146'));
  });

  it('release-gap Sandbox DB Yes keep-both with FR-144/145 + mrb-1215 board', () => {
    const gap = readUtf8NoBomAscii(GAP);
    assert.match(gap, /\|\s*Sandbox DB create \+ DDL apply runbook\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*Post-deploy smoke\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*VERSION \+ release checklist\s*\|\s*\*\*Yes\*\*/);

    assert.ok(fs.existsSync(MRB_DOC));
    const board = readUtf8NoBomAscii(MRB_DOC);
    assert.ok(board.includes('#1215'));
    assert.ok(board.includes('#982'));
    assert.ok(board.includes('FR-146'));
    assert.ok(board.includes('a_search_sandbox'));
  });
});