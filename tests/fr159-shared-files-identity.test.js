'use strict';

/**
 * FR-159: shared/package.json files[] must include identity/ and every
 * top-level shared runtime directory (so new dirs cannot be forgotten).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const pkgPath = path.join(sharedDir, 'package.json');

/** Skip non-runtime / tooling dirs under shared/. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', 'dist', 'test', 'tests']);

/**
 * Top-level shared dirs that contain at least one .js file (runtime).
 * @returns {string[]}
 */
function runtimeDirs() {
  return fs
    .readdirSync(sharedDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => !SKIP_DIRS.has(name) && !name.startsWith('.'))
    .filter((name) => {
      const dir = path.join(sharedDir, name);
      const walk = (p) => {
        for (const ent of fs.readdirSync(p, { withFileTypes: true })) {
          if (ent.isFile() && ent.name.endsWith('.js')) return true;
          if (ent.isDirectory() && !SKIP_DIRS.has(ent.name)) {
            if (walk(path.join(p, ent.name))) return true;
          }
        }
        return false;
      };
      return walk(dir);
    })
    .sort();
}

describe('FR-159 shared/package.json files include identity/ + all runtime dirs', () => {
  it('shared/identity/userId.js exists on disk', () => {
    assert.ok(
      fs.existsSync(path.join(sharedDir, 'identity', 'userId.js')),
      'missing shared/identity/userId.js',
    );
  });

  it('package.json files lists identity/ and every runtime dir', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(Array.isArray(pkg.files), 'files must be an array');
    assert.ok(
      pkg.files.includes('identity/'),
      `files missing identity/: ${JSON.stringify(pkg.files)}`,
    );
    const dirs = runtimeDirs();
    assert.ok(dirs.includes('identity'), 'identity must be a runtime dir');
    for (const name of dirs) {
      const entry = `${name}/`;
      assert.ok(
        pkg.files.includes(entry),
        `files missing runtime dir ${entry}: ${JSON.stringify(pkg.files)}`,
      );
    }
  });

  it('npm pack --dry-run includes identity/userId.js', () => {
    const r = spawnSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['pack', '--dry-run'],
      {
        cwd: sharedDir,
        encoding: 'utf8',
        shell: true,
        env: process.env,
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = `${r.stdout || ''}\n${r.stderr || ''}`;
    assert.match(
      out,
      /identity[/\\]userId\.js/,
      `npm pack --dry-run missing identity/userId.js:\n${out}`,
    );
  });

  it('FR-159 Decision LOCKED + release-gap Yes', () => {
    const fr = fs.readFileSync(
      path.join(root, 'docs', 'fr', 'FR-159.md'),
      'utf8',
    );
    assert.match(fr, /Decision LOCKED/i);
    assert.match(fr, /fr159-shared-files-identity\.test\.js/);
    assert.ok(
      !/[^\x09\x0A\x0D\x20-\x7E]/.test(fr),
      'FR-159.md must be ASCII',
    );
    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md'),
      'utf8',
    );
    assert.match(
      gap,
      /shared files\[\] missing identity\/[^\n]*FR-159[^\n]*\*\*Yes\*\*/i,
    );
  });
});
