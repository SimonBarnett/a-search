'use strict';

/**
 * MRB #1429 hostile pin: Phase-4 merchant-class local enable harvest lesson.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Phase-4 enable a merchant-class local (shopify/wix/woocommerce): set registry class=merchant merchantConnect=true, wire store credentials (API key/secret/access token/store URL - not affiliate sid), remove affiliate sid stamp from the worker, floors 2*enabled_count; keep generic Phase-4 enable FR bullets for affiliate/feed ids';

test('mrb1429: merchant-class Phase-4 enable harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'merchant-class Phase-4 enable lesson must stay contiguous');
  assert.ok(text.includes('class=merchant'));
  assert.ok(text.includes('merchantConnect=true'));
  assert.ok(text.includes('not affiliate sid'));
  assert.ok(text.includes('shopify/wix/woocommerce'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'));
});
