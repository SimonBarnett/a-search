'use strict';

/**
 * FR #3980: enable-* synth pins that call ensureDefaultStackSynth must require it.
 * Tip-fix for multi-arg it() supersedes on #3963 omitted the import on fr173/fr180.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const testsDir = path.join(root, 'tests');

const ENABLE_PINS = [
  'fr172-enable-partnerize.test.js',
  'fr173-enable-webgains.test.js',
  'fr174-enable-tradedoubler.test.js',
  'fr178-enable-shopify.test.js',
  'fr179-enable-wix.test.js',
  'fr180-enable-woocommerce.test.js',
];

describe('FR-3980 ensureDefaultStackSynth require on enable supersede pins', () => {
  it('every enable pin that calls ensureDefaultStackSynth also requires runCdkSynth', () => {
    for (const name of ENABLE_PINS) {
      const text = fs.readFileSync(path.join(testsDir, name), 'utf8');
      if (!/ensureDefaultStackSynth\s*\(/.test(text)) continue;
      assert.match(
        text,
        /require\(\s*['"]\.\/helpers\/runCdkSynth['"]\s*\)/,
        `${name} calls ensureDefaultStackSynth without require('./helpers/runCdkSynth')`,
      );
      assert.match(
        text,
        /\{\s*ensureDefaultStackSynth\s*\}/,
        `${name} must destructure ensureDefaultStackSynth from runCdkSynth`,
      );
    }
  });

  it('fr173 and fr180 specifically include the require (regression)', () => {
    for (const name of ['fr173-enable-webgains.test.js', 'fr180-enable-woocommerce.test.js']) {
      const text = fs.readFileSync(path.join(testsDir, name), 'utf8');
      assert.match(text, /ensureDefaultStackSynth\s*\(/);
      assert.match(
        text,
        /const\s*\{\s*ensureDefaultStackSynth\s*\}\s*=\s*require\(\s*['"]\.\/helpers\/runCdkSynth['"]\s*\)/,
      );
    }
  });
});
