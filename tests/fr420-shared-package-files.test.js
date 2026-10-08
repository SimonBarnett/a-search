'use strict';

/**
 * FR-420: shared/package.json files must include writeResults.js + resultsPath.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const sharedDir = path.join(root, 'shared');
const pkgPath = path.join(sharedDir, 'package.json');
const readmePath = path.join(sharedDir, 'README.md');

const REQUIRED_FILES = ['writeResults.js', 'resultsPath.js'];

describe('FR-420 shared/package.json files include writeResults + resultsPath', () => {
  it('disk modules exist under shared/', () => {
    for (const name of REQUIRED_FILES) {
      assert.ok(
        fs.existsSync(path.join(sharedDir, name)),
        `missing shared/${name}`,
      );
    }
  });

  it('package.json files array lists writeResults.js and resultsPath.js', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    assert.ok(Array.isArray(pkg.files), 'files must be an array');
    for (const name of REQUIRED_FILES) {
      assert.ok(
        pkg.files.includes(name),
        `files missing ${name}: ${JSON.stringify(pkg.files)}`,
      );
    }
  });

  it('README Contents table lists resultsPath.js and writeResults.js', () => {
    const text = fs.readFileSync(readmePath, 'utf8');
    assert.match(text, /## Contents/);
    assert.match(text, /`resultsPath\.js`/);
    assert.match(text, /`writeResults\.js`/);
  });

  it('npm pack --dry-run lists writeResults.js and resultsPath.js', () => {
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
    for (const name of REQUIRED_FILES) {
      assert.match(
        out,
        new RegExp(name.replace('.', '\\.')),
        `npm pack --dry-run missing ${name}:\n${out}`,
      );
    }
  });
});
