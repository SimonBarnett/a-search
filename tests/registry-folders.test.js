'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registry = require('../providers/registry.json');

describe('FR-022 every registry folder exists', () => {
  it('each sources[].folder has AGENTS, skill, .env.example, worker run()', () => {
    assert.ok(Array.isArray(registry.sources));
    assert.equal(registry.sources.length, 20);
    for (const s of registry.sources) {
      const base = path.join(root, s.folder);
      assert.ok(fs.existsSync(path.join(base, 'AGENTS.md')), `${s.id} AGENTS.md`);
      assert.ok(
        fs.existsSync(
          path.join(base, '.grok', 'skills', `a-search-${s.id}`, 'SKILL.md'),
        ),
        `${s.id} skill`,
      );
      assert.ok(fs.existsSync(path.join(base, '.env.example')), `${s.id} .env.example`);
      const workerPath = path.join(base, 'src', 'worker.js');
      assert.ok(fs.existsSync(workerPath), `${s.id} worker`);
      const { run } = require(workerPath);
      assert.equal(typeof run, 'function', `${s.id} run export`);
    }
  });
});
