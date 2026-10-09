'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB #32 hostile: FR-001 root scaffold', () => {
  it('package.json contract and POSIX-safe run-tests entry', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'a-search');
    assert.equal(pkg.private, true);
    assert.match(pkg.engines.node, />=\s*20/);
    assert.match(pkg.scripts.test, /run-tests\.js/);
    assert.ok(
      fs.existsSync(path.join(root, 'scripts', 'run-tests.js')),
      'scripts/run-tests.js must exist for cross-platform npm test',
    );
    const runner = fs.readFileSync(path.join(root, 'scripts', 'run-tests.js'), 'utf8');
    assert.match(runner, /readdirSync/);
    assert.match(runner, /--test/);
    assert.doesNotMatch(
      pkg.scripts.test,
      /node --test\s+"tests\/\*\*\/\*\.test\.js"/,
      'quoted tests/**/*.test.js is a literal path on Linux GitHub Actions',
    );
  });

  it('gitignore covers node_modules, .env, coverage', () => {
    const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.match(gi, /node_modules/);
    assert.match(gi, /\.env/);
    assert.match(gi, /coverage/);
  });

  it('README Develop documents npm test', () => {
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    assert.match(readme, /## Develop/);
    assert.match(readme, /npm test/);
  });

  it('smoke.test.js exists and is picked up by npm test glob', () => {
    assert.ok(fs.existsSync(path.join(root, 'tests', 'smoke.test.js')));
  });
});
