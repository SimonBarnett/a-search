'use strict';

/**
 * FR #5193: required conflict-marker gate for a-search (class of #5181 tip e822f75).
 * Script lives at scripts/check_conflict_markers.py (bobiverse FR #1634 shape).
 * Must catch line-anchored markers; mid-line prose documenting <<<<<<< must pass.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts', 'check_conflict_markers.py');
const skill = path.join(
  root,
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);
const ciYml = path.join(root, '.github', 'workflows', 'ci.yml');

function runPython(args, cwd) {
  const r = spawnSync('python', args, {
    encoding: 'utf8',
    cwd: cwd || root,
  });
  return r;
}

describe('FR #5193 check_conflict_markers gate', () => {
  it('script exists and clean harvest SKILL exits 0', () => {
    assert.ok(fs.existsSync(script), 'scripts/check_conflict_markers.py missing');
    const r = runPython([script, '--root', root, skill]);
    assert.equal(r.status, 0, `clean skill exit ${r.status}: ${r.stderr || r.stdout}`);
    assert.match(r.stdout || '', /check_conflict_markers: OK/);
  });

  it('fixture with BOL markers exits 1', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5193-'));
    const bad = path.join(tmp, 'bad.md');
    fs.writeFileSync(
      bad,
      ['# x', '<<<<<<< HEAD', '- tip', '=======', '- main', '>>>>>>> origin/main', ''].join(
        '\n',
      ),
      'utf8',
    );
    const r = runPython([script, '--root', tmp, bad]);
    assert.equal(r.status, 1, `expected fail, got ${r.status}: ${r.stdout}`);
    assert.match(r.stderr || '', /check_conflict_markers: FAIL/);
    assert.match(r.stderr || '', /<<<<<<< HEAD/);
  });

  it('mid-line prose documenting markers does not fail', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fr5193-prose-'));
    const ok = path.join(tmp, 'prose.md');
    fs.writeFileSync(
      ok,
      "Hostile pins that assert !includes('<<<<<<<') false-positive when documenting markers.\n",
      'utf8',
    );
    const r = runPython([script, '--root', tmp, ok]);
    assert.equal(r.status, 0, `prose false-positive: ${r.stderr || r.stdout}`);
  });

  it('ci.yml always runs check_conflict_markers in test-and-synth', () => {
    const yml = fs.readFileSync(ciYml, 'utf8');
    assert.match(yml, /check_conflict_markers\.py/);
    assert.match(yml, /FR #5193|FR-5193|#5193/);
    // Must not be gated solely behind heavy == true (docs/skills harvest tips)
    assert.match(
      yml,
      /Check conflict markers[\s\S]{0,400}check_conflict_markers\.py/,
    );
  });
});
