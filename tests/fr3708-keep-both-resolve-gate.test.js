'use strict';

/**
 * FR #3708: keep-both harvest SKILL resolve must not commit conflict markers.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const skillPath = path.join(root, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');
const helperPath = path.join(root, 'scripts', 'resolve_harvest_skill_keep_both.py');

const NEEDLE =
  'Never git add/commit harvest SKILL.md until check_conflict_markers (or resolve_harvest_skill_keep_both.py) exits 0; stop the pipeline if keep-both resolve assert fails; prefer a single Python resolve+verify+write step before any commit (class of #3708).';

describe('FR #3708 keep-both resolve gate', () => {
  it('pins contiguous conflict-marker gate playbook (ASCII no BOM)', () => {
    const buf = fs.readFileSync(skillPath);
    assert.notEqual(buf[0], 0xef, 'no UTF-8 BOM');
    const text = buf.toString('utf8');
    assert.ok(text.includes(NEEDLE), 'contiguous FR #3708 keep-both gate bullet missing');
    assert.match(text, /resolve_harvest_skill_keep_both\.py/);
    assert.match(text, /#3708/);
    assert.doesNotMatch(NEEDLE, /[\u2014\u2013]/);
  });

  it('helper keep-both writes clean file and refuses markers', () => {
    assert.ok(fs.existsSync(helperPath), 'scripts/resolve_harvest_skill_keep_both.py missing');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3708-'));
    const conflicted = path.join(tmp, 'SKILL.md');
    const body = [
      '# Harvest',
      '',
      '## Harvested lessons',
      '- tip alpha',
      '<<<<<<< HEAD',
      '- tip from tip branch',
      '=======',
      '- tip from main',
      '>>>>>>> main',
      '',
    ].join('\n');
    fs.writeFileSync(conflicted, body, 'utf8');
    const r = spawnSync('python', [helperPath, conflicted], { encoding: 'utf8' });
    assert.equal(r.status, 0, `helper exit ${r.status}: ${r.stderr || r.stdout}`);
    const out = fs.readFileSync(conflicted, 'utf8');
    assert.doesNotMatch(out, /^<<<<<<<|^=======|^>>>>>>>/m);
    assert.match(out, /- tip from tip branch/);
    assert.match(out, /- tip from main/);
    assert.match(out, /- tip alpha/);
  });
});
