'use strict';

/**
 * MRB #1232 hostile pin: FR-148 entry omits A_SEARCH_ENV.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STACK = path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js');
const ENVEX = path.join(ROOT, 'entry', '.env.example');
const FR = path.join(ROOT, 'docs', 'fr', 'FR-148.md');
const ENVDOC = path.join(ROOT, 'docs', 'environments.md');
const PIN = path.join(ROOT, 'tests', 'fr148-entry-env-matrix.test.js');
const MRB34 = path.join(ROOT, 'tests', 'entry.hostile-mrb34.test.js');
const MRB_DOC = path.join(ROOT, 'docs', 'mrb', 'mrb-1232.md');

describe('MRB-1232 hostile FR-148 entry env matrix', () => {
  it('entryEnv omits A_SEARCH_ENV; workers stay pinned', () => {
    const text = fs.readFileSync(STACK, 'utf8');
    assert.ok(text.includes('FR-148'));
    const m = text.match(/const entryEnv\s*=\s*\{([\s\S]*?)\n\s*\};/);
    assert.ok(m, 'entryEnv missing');
    assert.doesNotMatch(m[1], /A_SEARCH_ENV/);
    assert.match(text, /A_SEARCH_ENV:\s*'live'/);
    assert.match(text, /A_SEARCH_ENV:\s*'sandbox'/);
  });

  it('Decision LOCKED + .env.example no pinned A_SEARCH_ENV + mrb34 flipped', () => {
    assert.ok(fs.existsSync(PIN));
    const fr = fs.readFileSync(FR, 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.ok(fr.includes('fr148-entry-env-matrix.test.js'));

    const ex = fs.readFileSync(ENVEX, 'utf8');
    assert.ok(ex.includes('FR-148'));
    assert.doesNotMatch(ex, /^A_SEARCH_ENV\s*=/m);

    const env = fs.readFileSync(ENVDOC, 'utf8');
    assert.ok(env.includes('FR-148'));
    assert.match(env, /omits|env-agnostic/i);

    const mrb34 = fs.readFileSync(MRB34, 'utf8');
    assert.ok(mrb34.includes('FR-148'));
    assert.ok(mrb34.includes('no pinned A_SEARCH_ENV'));
    assert.doesNotMatch(mrb34, /assigns\.includes\('A_SEARCH_ENV'\)/);
  });

  it('docs/mrb-1232 board cites covering PRs', () => {
    assert.ok(fs.existsSync(MRB_DOC));
    const board = fs.readFileSync(MRB_DOC, 'utf8');
    assert.ok(board.includes('#1232'));
    assert.ok(board.includes('#984'));
    assert.ok(board.includes('FR-148'));
    assert.ok(board.includes('entryEnv'));
  });
});