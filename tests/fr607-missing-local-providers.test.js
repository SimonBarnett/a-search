'use strict';

/**
 * FR #607: Madeira merchant-store local providers (shopify, wix, woocommerce)
 * scaffolded as disabled stubs matching FR-022 / FR-060i pattern.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const IDS = ['shopify', 'wix', 'woocommerce'];

describe('FR-607 missing local providers (shopify/wix/woocommerce)', () => {
  it('registry lists each as local disabled with queueEnv', () => {
    const { loadRegistry } = require('../providers/loadRegistry');
    const { sources } = loadRegistry();
    assert.equal(sources.length, 20);
    for (const id of IDS) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, `missing ${id}`);
      assert.equal(s.kind, 'local');
      assert.equal(s.folder, `providers/local/${id}`);
      assert.equal(s.enabled.live, false);
      assert.equal(s.enabled.sandbox, false);
      assert.equal(s.queueEnv, `SQS_${id.toUpperCase()}_URL`);
    }
  });

  for (const id of IDS) {
    it(`${id} folder has AGENTS, skills, .env.example, run()`, () => {
      const base = path.join(root, 'providers', 'local', id);
      assert.ok(fs.existsSync(path.join(base, 'AGENTS.md')));
      assert.ok(
        fs.existsSync(
          path.join(base, '.grok', 'skills', `a-search-${id}`, 'SKILL.md'),
        ),
      );
      assert.ok(
        fs.existsSync(
          path.join(
            base,
            '.grok',
            'skills',
            `a-search-${id}-onboarding`,
            'SKILL.md',
          ),
        ),
      );
      assert.ok(fs.existsSync(path.join(base, '.env.example')));
      const { run } = require(path.join(base, 'src', 'worker.js'));
      assert.equal(typeof run, 'function');
    });
  }

  it('provider-shortlist.md documents the three Madeira store ids', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'provider-shortlist.md'),
      'utf8',
    );
    for (const id of IDS) {
      assert.match(text, new RegExp(`\`${id}\``), id);
    }
    assert.match(text, /Madeira/i);
  });
});
