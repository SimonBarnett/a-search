'use strict';

/**
 * FR #4387: supersede merchantConnect entry-staging harvest lesson.
 * Simon Design (FR #4376 / product #4381): entry must not stage magento /
 * merchant shop adapters; strip shared/shops + lazy shop routes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILL = path.join(
  __dirname,
  '..',
  '.grok',
  'skills',
  'harvest-agent-skills',
  'SKILL.md',
);

const SUPERSEDED =
  'Entry Lambda staging: merchantConnect provider src must be copied into the asset even when the source is disabled for selftest; shop adapters eager-require those modules at init.';

const DESIGN =
  'FR #4376: /search entry must not stage or load merchant shop adapters; strip shared/shops from the staged asset and lazy-require shop routes';

describe('FR #4387 harvest-agent-skills: no superseded merchantConnect staging lesson', () => {
  it('removes the merchantConnect staging bullet that contradicts Design', () => {
    const buf = fs.readFileSync(SKILL);
    assert.notEqual(buf[0], 0xef, 'SKILL.md must be UTF-8 without BOM');
    const text = buf.toString('utf8').replace(/\r\n/g, '\n');
    assert.equal(
      text.includes(SUPERSEDED),
      false,
      'superseded merchantConnect staging lesson must be gone',
    );
    assert.ok(text.includes(DESIGN), 'FR #4376 Design strip/lazy lesson must remain');
    assert.ok(
      text.includes('never fix ImportModuleError by staging magento'),
      'must keep magento-not-in-entry guidance',
    );
  });
});
