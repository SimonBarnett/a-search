'use strict';

/**
 * MRB #1213 hostile pin: FR-145 VERSION + release-checklist needles.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const VERSION = path.join(ROOT, 'VERSION');
const PKG = path.join(ROOT, 'package.json');
const CHECKLIST = path.join(ROOT, 'docs', 'release-checklist.md');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-145.md');
const GAP = path.join(ROOT, 'docs', 'release-gap-aws-installable-2026-10-09.md');
const README = path.join(ROOT, 'README.md');
const DOD = path.join(ROOT, 'docs', 'release-installable.md');
const PIN = path.join(ROOT, 'tests', 'fr145-version-checklist.test.js');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1213.md');
const EXPECTED = '0.1.0';

function readUtf8NoBom(p) {
  const raw = fs.readFileSync(p);
  assert.notEqual(raw[0], 0xef, path.basename(p) + ' must be UTF-8 without BOM');
  for (let i = 0; i < raw.length; i++) {
    assert.ok(raw[i] < 128, path.basename(p) + ' must stay ASCII (byte ' + raw[i] + ' at ' + i + ')');
  }
  return raw.toString('utf8');
}

describe('MRB-1213 hostile FR-145 VERSION checklist', () => {
  it('VERSION 0.1.0 matches package.json; no v prefix', () => {
    const text = readUtf8NoBom(VERSION).trim();
    assert.equal(text, EXPECTED);
    assert.doesNotMatch(text, /^v/i);
    const pkg = JSON.parse(readUtf8NoBom(PKG));
    assert.equal(pkg.version, EXPECTED);
  });

  it('checklist + Decision LOCKED + README/DoD pointers + pin present', () => {
    const checklist = readUtf8NoBom(CHECKLIST);
    assert.ok(checklist.includes('FR-145'));
    assert.ok(checklist.includes('v0.1.0'));
    assert.match(checklist, /npm test|tests green/i);
    assert.match(checklist, /synth/i);
    assert.match(checklist, /smoke/i);

    const fr = readUtf8NoBom(FR);
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.ok(fr.includes('VERSION'));
    assert.ok(fr.includes('fr145-version-checklist.test.js'));

    assert.ok(fs.existsSync(PIN));
    // README may carry baseline non-ASCII elsewhere; pin FR-145 needles only
    const readme = fs.readFileSync(README, 'utf8');
    assert.ok(readme.includes('release-checklist.md'));
    assert.ok(readme.includes('FR-145'));
    assert.ok(readUtf8NoBom(DOD).includes('release-checklist.md'));
  });

  it('release-gap VERSION Yes + keep-both Post-deploy smoke Yes + mrb-1213 board', () => {
    const gap = readUtf8NoBom(GAP);
    assert.match(gap, /\|\s*VERSION \+ release checklist\s*\|\s*\*\*Yes\*\*/);
    assert.match(gap, /\|\s*Post-deploy smoke\s*\|\s*\*\*Yes\*\*/);

    assert.ok(fs.existsSync(MRB_DOC), 'docs/mrb/mrb-1213.md missing');
    const board = readUtf8NoBom(MRB_DOC);
    assert.ok(board.includes('#1213'));
    assert.ok(board.includes('#981'));
    assert.ok(board.includes('FR-145'));
    assert.ok(board.includes('0.1.0'));
  });
});