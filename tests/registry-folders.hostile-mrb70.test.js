'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const registry = require('../providers/registry.json');

describe('MRB #70 hostile: FR-022 registry folders', () => {
  it('every registry sources[].folder has AGENTS skill env worker run()', () => {
    assert.equal(registry.sources.length, 20);
    for (const s of registry.sources) {
      const base = path.join(root, s.folder);
      assert.ok(fs.existsSync(path.join(base, 'AGENTS.md')), `${s.id} AGENTS`);
      assert.ok(
        fs.existsSync(path.join(base, '.grok', 'skills', `a-search-${s.id}`, 'SKILL.md')),
        `${s.id} skill`,
      );
      assert.ok(fs.existsSync(path.join(base, '.env.example')), `${s.id} env`);
      const { run } = require(path.join(base, 'src', 'worker.js'));
      assert.equal(typeof run, 'function', `${s.id} run`);
    }
  });

  it('keeps richer cj/awin/impact scaffolds over thin FR-022 stubs', () => {
    const cjSkill = fs.readFileSync(
      path.join(root, 'providers/live/cj/.grok/skills/a-search-cj/SKILL.md'),
      'utf8',
    );
    assert.match(cjSkill, /ads\.api\.cj\.com/i);
    const awinWorker = fs.readFileSync(
      path.join(root, 'providers/local/awin/src/worker.js'),
      'utf8',
    );
    assert.match(awinWorker, /queryParts/);
    const impactSkill = fs.readFileSync(
      path.join(root, 'providers/local/impact/.grok/skills/a-search-impact/SKILL.md'),
      'utf8',
    );
    assert.match(impactSkill, /Parts/i);
    assert.match(impactSkill, /maintainer/i);
  });
});