'use strict';

/**
 * MRB #4171 hostile pin for FR #4155 onboarding skills:
 * hold networks must stay dark; tip skills must not carry mojibake.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const ACTIVE = ['impact', 'partnerize', 'webgains', 'tradedoubler'];
const HELD = ['admitad', 'flexoffers', 'avantlink'];

function skillPath(id) {
  return path.join(
    ROOT,
    'providers',
    'local',
    id,
    '.grok',
    'skills',
    `a-search-${id}-onboarding`,
    'SKILL.md',
  );
}

describe('MRB #4171 hostile FR #4155 onboarding', () => {
  it('held networks document HOLD / do not sign up', () => {
    for (const id of HELD) {
      const text = fs.readFileSync(skillPath(id), 'utf8');
      assert.match(text, /##\s*HOLD/i);
      assert.match(text, /Do not sign up/i);
    }
  });

  it('active networks are not under HOLD section', () => {
    for (const id of ACTIVE) {
      const text = fs.readFileSync(skillPath(id), 'utf8');
      assert.doesNotMatch(text, /^##\s*HOLD\b/m);
    }
  });

  it('tip onboarding skills have no UTF-8 mojibake or U+2014/U+2026', () => {
    for (const id of [...ACTIVE, ...HELD]) {
      const text = fs.readFileSync(skillPath(id), 'utf8');
      assert.doesNotMatch(text, /ÔÇö|Ã¢|â€/);
      assert.equal(text.includes('\u2014'), false, `${id} em dash`);
      assert.equal(text.includes('\u2026'), false, `${id} ellipsis`);
    }
  });
});
