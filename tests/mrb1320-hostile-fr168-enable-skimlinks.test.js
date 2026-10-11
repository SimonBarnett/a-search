'use strict';

/**
 * MRB #1320 docs/hostile: FR-168 enable skimlinks live+sandbox + FR-138 secret wiring.
 * Keep-both with FR-167 kijiji + FR-169 aliexpress => 9 enabled x 2 envs = 18 floors.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function utf8NoBom(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.notEqual(buf[0], 0xef, `${rel} must be UTF-8 without BOM`);
  return buf.toString('utf8');
}

describe('MRB #1320 hostile FR-168 enable skimlinks', () => {
  it('registry: skimlinks both envs true; kijiji+aliexpress also enabled', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('skimlinks').enabled.live, true);
    assert.equal(byId.get('skimlinks').enabled.sandbox, true);
    assert.equal(byId.get('kelkoo').enabled.live, true, 'FR-167');
    assert.equal(byId.get('aliexpress').enabled.live, true, 'FR-169');
  });

  it('stack wires PROVIDER_CREDENTIAL_KEYS.skimlinks + SKIMLINKS_COUNTRY plain default', () => {
    const text = utf8NoBom(path.join('cdk', 'lib', 'a-search-stack.js'));
    assert.match(
      text,
      /PROVIDER_CREDENTIAL_KEYS[\s\S]*skimlinks[\s\S]*SKIMLINKS_API_KEY/,
    );
    assert.match(
      text,
      /PROVIDER_CREDENTIAL_KEYS[\s\S]*skimlinks[\s\S]*SKIMLINKS_PUBLISHER_ID/,
    );
    assert.match(
      text,
      /PROVIDER_PLAIN_DEFAULTS[\s\S]*skimlinks[\s\S]*SKIMLINKS_COUNTRY/,
    );
  });

  it('FR-142/143 pins use 18 primary/DLQ floors (kelkoo+skimlinks+aliexpress)', () => {
    const fr142 = utf8NoBom(path.join('tests', 'fr142-sqs-dlq.test.js'));
    const fr143 = utf8NoBom(
      path.join('tests', 'fr143-cw-retention-dlq-alarm.test.js'),
    );
    assert.match(fr142, /expected 18 primary queues/);
    assert.match(fr143, /expected 18 DLQ depth alarms/);
    assert.match(fr142, /'skimlinks'/);
    assert.match(fr142, /'kelkoo'/);
    assert.match(fr142, /'aliexpress'/);
  });

  it('stay-dark pins exclude skimlinks; DEFAULT_ON includes skimlinks; Decision LOCKED', () => {
    const fr166 = utf8NoBom(
      path.join('tests', 'fr166-phase4-enablement-index.test.js'),
    );
    assert.doesNotMatch(
      fr166,
      /PHASE2_STUB_IDS\s*=\s*\[[^\]]*'\s*skimlinks\s*'/,
    );
    const reg = utf8NoBom(path.join('tests', 'registry.test.js'));
    assert.match(reg, /DEFAULT_ON[\s\S]*'skimlinks'/);
    const fr = utf8NoBom(path.join('docs', 'fr', 'FR-168.md'));
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /skimlinks/i);
    const matrix = utf8NoBom(path.join('docs', 'secrets-matrix.md'));
    assert.match(matrix, /SKIMLINKS_API_KEY/);
    assert.doesNotMatch(matrix, /Stay-dark omitted[\s\S]*\bskimlinks\b/i);
  });
});
