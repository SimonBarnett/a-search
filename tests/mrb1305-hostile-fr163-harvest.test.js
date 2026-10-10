'use strict';

/**
 * MRB #1305 hostile pin: FR-163 destroy-rollback harvest lesson contiguous
 * in harvest-agent-skills (product #1304 / tip #1305).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SKILL = path.join(ROOT, '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md');

const NEEDLE =
  'Installable stacks need docs/destroy-rollback.md: what cdk destroy deletes vs RemovalPolicy.RETAIN bucket, retain SQL/secrets, ordered teardown; CI auto-destroy stays OOS (FR-163 / #1006).';

test('mrb1305: FR-163 destroy-rollback harvest lesson contiguous UTF-8 no BOM', () => {
  const raw = fs.readFileSync(SKILL);
  assert.notEqual(raw[0], 0xef, 'SKILL.md must not start with UTF-8 BOM');
  const text = raw.toString('utf8');
  assert.ok(text.includes(NEEDLE), 'FR-163 harvest lesson must stay contiguous');
  assert.ok(text.includes('docs/destroy-rollback.md'));
  assert.ok(text.includes('RemovalPolicy.RETAIN'));
  assert.ok(text.includes('FR-163'));
  assert.ok(text.includes('#1006'));
  assert.ok(text.endsWith('\n') || text.endsWith('\r\n'), 'trailing newline');
});
