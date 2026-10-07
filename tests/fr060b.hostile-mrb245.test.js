'use strict';

/** Hostile pins FR-060b / MRB #245 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const { loadRegistry } = require('../providers/loadRegistry');

describe('hostile MRB #245 FR-060b', () => {
  it('enabled sources include amazon and each has onboarding SKILL.md', () => {
    const enabled = loadRegistry().sources.filter(
      (s) => s.enabled && (s.enabled.live === true || s.enabled.sandbox === true),
    );
    assert.ok(enabled.some((s) => s.id === 'amazon'));
    for (const s of enabled) {
      const p = path.join(
        root,
        s.folder,
        '.grok',
        'skills',
        `a-search-${s.id}-onboarding`,
        'SKILL.md',
      );
      assert.ok(fs.existsSync(p), p);
      assert.match(fs.readFileSync(p, 'utf8'), /CAST IRON/i);
    }
  });
});
