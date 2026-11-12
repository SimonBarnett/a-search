'use strict';

/**
 * MRB #5344 hostile: hold-dark checklist must not flip amazon/wix or registry.json.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const REGISTRY = path.join(ROOT, 'providers', 'registry.json');
const CHECKLIST = path.join(ROOT, 'docs', 'release-checklist.md');

describe('MRB #5344 hostile hold-dark vs enabled set', () => {
  it('amazon and wix stay enabled true; not named on the hold-dark line', () => {
    const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of ['amazon', 'wix']) {
      assert.equal(byId.get(id).enabled.live, true, id + ' live');
      assert.equal(byId.get(id).enabled.sandbox, true, id + ' sandbox');
    }
    const holdLine = fs
      .readFileSync(CHECKLIST, 'utf8')
      .split(/\r?\n/)
      .find((l) => /hold-dark/i.test(l));
    assert.ok(holdLine);
    assert.doesNotMatch(holdLine, /\bamazon\b/i);
    assert.doesNotMatch(holdLine, /\bwix\b/i);
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
