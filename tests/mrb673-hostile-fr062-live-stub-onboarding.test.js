'use strict';

/**
 * MRB #673 hostile: FR-062 live stub onboarding skills stay-dark + CAST IRON.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
/** Live stub onboarding books (skills still required even when enabled). */
const IDS = ['kelkoo', 'skimlinks', 'aliexpress', 'etsy', 'bol'];
/** Still-disabled live stubs after FR-167 + FR-168 + FR-169. */
const STAY_DARK_IDS = ['bol'];

function readNoBom(rel) {
  const p = path.join(root, rel);
  const buf = fs.readFileSync(p);
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, false, rel);
  assert.equal(buf[buf.length - 1], 0x0a, `trailing newline ${rel}`);
  return buf.toString('utf8');
}

describe('MRB #673 hostile FR-062 live stub onboarding', () => {
  for (const id of IDS) {
    it(`${id} onboarding skill: CAST IRON, stay-dark, deferred .env`, () => {
      const text = readNoBom(
        path.join(
          'providers',
          'live',
          id,
          '.grok',
          'skills',
          `a-search-${id}-onboarding`,
          'SKILL.md',
        ),
      );
      assert.match(text, /CAST IRON/);
      assert.match(text, /SimonBarnett\/a-search/);
      assert.match(text, /not enabled|UNKNOWN|disabled stub/i);
      assert.match(text, /stay-dark|enabled\.live=false|enabled live=false/i);
      assert.match(text, /phase2-providers\.md/);
      assert.match(text, /Do \*\*not\*\* invent live credential|Do not request live API keys/i);
    });
  }

  it('registry keeps remaining live stubs disabled (kelkoo+skimlinks+aliexpress enabled)', () => {
    const { loadRegistry } = require('../providers/loadRegistry');
    const { sources } = loadRegistry();
    for (const id of STAY_DARK_IDS) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, id);
      assert.equal(s.enabled.live, false);
      assert.equal(s.enabled.sandbox, false);
    }
    for (const id of ['kelkoo', 'skimlinks', 'aliexpress']) {
      const s = sources.find((x) => x.id === id);
      assert.ok(s, id);
      assert.equal(s.enabled.live, true, id);
      assert.equal(s.enabled.sandbox, true, id);
    }
  });

  it('provider-onboarding-skills.md Live stubs FR-062 checklist', () => {
    const text = readNoBom('docs/provider-onboarding-skills.md');
    assert.match(text, /## Live stubs \(FR-062\)/);
    for (const id of IDS) {
      assert.match(text, new RegExp(`\`${id}\``));
    }
    assert.match(text, /phase2-providers\.md/);
  });
});
