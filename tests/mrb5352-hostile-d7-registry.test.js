'use strict';

/**
 * MRB #5352 hostile: D7 market-hold docs must not edit registry.json.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'providers', 'registry.json');
const DOC = path.join(ROOT, 'docs', 'release-installable.md');

describe('MRB #5352 hostile D7 vs registry', () => {
  it('amazon stays enabled and is not a D7 hold id', () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const amazon = registry.sources.find((s) => s.id === 'amazon');
    assert.equal(amazon.enabled.live, true);
    assert.equal(amazon.enabled.sandbox, true);
    const d7 = fs
      .readFileSync(DOC, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\|\s*D7\s*\|/i.test(l));
    assert.ok(d7);
    assert.doesNotMatch(d7, /\bamazon\b/i);
  });

  it('this tip does not modify providers/registry.json vs origin/main', () => {
    const r = spawnSync(
      'git',
      ['diff', '--name-only', 'origin/main...HEAD'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(r.status, 0, r.stderr || 'git diff failed');
    const names = r.stdout.split(/\r?\n/).filter(Boolean);
    assert.ok(!names.includes('providers/registry.json'), names.join(','));
  });
});
