'use strict';

/**
 * MRB #1217 hostile pin: FR-147 rclone installable mount runbook needles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const RCLONE = path.join(ROOT, 'docs', 'rclone-results.md');
const PIN = path.join(ROOT, 'tests', 'fr147-rclone-mount-runbook.test.js');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-147.md');
const GAP = path.join(ROOT, 'docs', 'release-gap-aws-installable-2026-10-09.md');
const DEPLOY = path.join(ROOT, 'docs', 'deploy.md');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1217.md');

function readUtf8NoBomAscii(p) {
  const raw = fs.readFileSync(p);
  assert.notEqual(raw[0], 0xef, path.basename(p) + ' must be UTF-8 without BOM');
  for (let i = 0; i < raw.length; i++) {
    assert.ok(raw[i] < 128, path.basename(p) + ' must stay ASCII (byte ' + raw[i] + ' at ' + i + ')');
  }
  return raw.toString('utf8');
}

describe('MRB-1217 hostile FR-147 rclone mount runbook', () => {
  it('rclone-results.md Installable mount runbook keeps FR-124 locks', () => {
    const text = readUtf8NoBomAscii(RCLONE);
    assert.ok(text.includes('Installable mount runbook (FR-147)'));
    assert.ok(text.includes('A_SEARCH_RCLONE_ROOT'));
    assert.match(text, /\bX:\\/);
    assert.ok(text.includes('live\\') || text.includes('live/'));
    assert.ok(text.includes('sandbox\\') || text.includes('sandbox/'));
    assert.ok(text.includes('FR-124'));
    assert.doesNotMatch(text, /A_SEARCH_RCLONE_ROOT=S:\\/);
  });

  it('Decision LOCKED + deploy cross-link + pin present', () => {
    assert.ok(fs.existsSync(PIN));
    const fr = readUtf8NoBomAscii(FR);
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.ok(fr.includes('fr147-rclone-mount-runbook.test.js'));
    const deploy = fs.readFileSync(DEPLOY, 'utf8');
    assert.ok(deploy.includes('rclone-results.md'));
    assert.ok(deploy.includes('FR-147'));
  });

  it('release-gap rclone Yes keep-both FR-144..146 + mrb-1217 board', () => {
    const gap = readUtf8NoBomAscii(GAP);
    assert.match(gap, /\|\s*rclone SQL-host runbook\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*Post-deploy smoke\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*VERSION \+ release checklist\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*Sandbox DB create \+ DDL apply runbook\s*\|\s*\*\*Yes\*\*/);

    assert.ok(fs.existsSync(MRB_DOC));
    const board = readUtf8NoBomAscii(MRB_DOC);
    assert.ok(board.includes('#1217'));
    assert.ok(board.includes('#983'));
    assert.ok(board.includes('FR-147'));
    assert.ok(board.includes('rclone'));
  });
});