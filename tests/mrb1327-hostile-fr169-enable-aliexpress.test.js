'use strict';
/**
 * MRB #1327 docs/hostile: FR-169 enable aliexpress only; FR-142/143 floors follow enabled pairs.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

describe('MRB #1327 hostile FR-169 aliexpress enable', () => {
  it('registry: aliexpress both envs true; skimlinks+kelkoo also enabled', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('aliexpress').enabled.live, true);
    assert.equal(byId.get('aliexpress').enabled.sandbox, true);
    assert.equal(byId.get('skimlinks').enabled.live, true, 'FR-168');
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
  });

  it('stack wires PROVIDER_CREDENTIAL_KEYS.aliexpress + tracking plain default', () => {
    const text = fs.readFileSync(path.join(root, 'cdk', 'lib', 'a-search-stack.js'), 'utf8');
    assert.match(text, /PROVIDER_CREDENTIAL_KEYS[\s\S]*aliexpress[\s\S]*ALIEXPRESS_API_KEY/);
    assert.match(text, /PROVIDER_PLAIN_DEFAULTS[\s\S]*aliexpress[\s\S]*ALIEXPRESS_TRACKING_ID/);
  });

  it('FR-142/143 pins use 20 primary/DLQ floors after FR-167..170', () => {
    const fr142 = fs.readFileSync(path.join(root, 'tests', 'fr142-sqs-dlq.test.js'), 'utf8');
    const fr143 = fs.readFileSync(path.join(root, 'tests', 'fr143-cw-retention-dlq-alarm.test.js'), 'utf8');
    assert.match(fr142, /expected 20 primary queues/);
    assert.match(fr143, /expected 20 DLQ depth alarms/);
  });

  it('stay-dark pins exclude aliexpress (fr166/mrb1042/registry DEFAULT_ON)', () => {
    const fr166 = fs.readFileSync(path.join(root, 'tests', 'fr166-phase4-enablement-index.test.js'), 'utf8');
    assert.doesNotMatch(fr166, /PHASE2_STUB_IDS\s*=\s*\[[^\]]*'\s*aliexpress\s*'/);
    const reg = fs.readFileSync(path.join(root, 'tests', 'registry.test.js'), 'utf8');
    assert.match(reg, /DEFAULT_ON[\s\S]*'aliexpress'/);
    const mrb1042 = fs.readFileSync(path.join(root, 'tests', 'mrb1042-hostile-phase4-park.test.js'), 'utf8');
    assert.match(mrb1042, /FR-169 enables aliexpress/);
  });
});
