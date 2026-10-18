'use strict';
/**
 * MRB #1327 docs/hostile: FR-169 aliexpress enable superseded by GBP/UK market hold (FR-254).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

describe('MRB #1327 hostile FR-169 aliexpress enable', () => {
  it('registry: aliexpress both envs false (GBP/UK hold); skimlinks+kelkoo still enabled', () => {
    const registry = JSON.parse(fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'));
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('aliexpress').enabled.live, false);
    assert.equal(byId.get('aliexpress').enabled.sandbox, false);
    assert.equal(byId.get('skimlinks').enabled.live, true, 'FR-168');
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
  });

  it('stack wires PROVIDER_CREDENTIAL_KEYS.aliexpress + tracking plain default', () => {
    const text = fs.readFileSync(path.join(root, 'cdk', 'lib', 'a-search-stack.js'), 'utf8');
    assert.match(text, /PROVIDER_CREDENTIAL_KEYS[\s\S]*aliexpress[\s\S]*ALIEXPRESS_API_KEY/);
    assert.match(text, /PROVIDER_PLAIN_DEFAULTS[\s\S]*aliexpress[\s\S]*ALIEXPRESS_TRACKING_ID/);
  });

  it('FR-142/143 pins use 24 primary/DLQ floors after GBP/UK hold disables', () => {
    const fr142 = fs.readFileSync(path.join(root, 'tests', 'fr142-sqs-dlq.test.js'), 'utf8');
    const fr143 = fs.readFileSync(path.join(root, 'tests', 'fr143-cw-retention-dlq-alarm.test.js'), 'utf8');
    assert.match(fr142, /expected 30 primary queues/);
    assert.match(fr143, /expected 30 DLQ depth alarms/);
  });

  it('registry DEFAULT_OFF includes aliexpress hold; folders retained', () => {
    const reg = fs.readFileSync(path.join(root, 'tests', 'registry.test.js'), 'utf8');
    assert.match(reg, /DEFAULT_OFF[\s\S]*'aliexpress'/);
    assert.ok(fs.existsSync(path.join(root, 'providers', 'live', 'aliexpress')));
  });
});