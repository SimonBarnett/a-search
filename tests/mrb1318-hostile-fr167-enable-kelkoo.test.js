'use strict';

/**
 * MRB #1318 docs/hostile: FR-167 enable kelkoo live+sandbox + FR-138 secret wiring.
 * Pins survive keep-both with FR-169 aliexpress (8 enabled -> 16 queues).
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

describe('MRB #1318 hostile FR-167 enable kelkoo', () => {
  it('registry: kelkoo both envs true; skimlinks stays dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('kelkoo').enabled.live, true);
    assert.equal(byId.get('kelkoo').enabled.sandbox, true);
    assert.equal(byId.get('skimlinks').enabled.live, false);
  });

  it('stack wires PROVIDER_CREDENTIAL_KEYS.kelkoo + KELKOO_COUNTRY plain default', () => {
    const text = utf8NoBom(path.join('cdk', 'lib', 'a-search-stack.js'));
    assert.match(
      text,
      /PROVIDER_CREDENTIAL_KEYS[\s\S]*kelkoo[\s\S]*KELKOO_API_KEY/,
    );
    assert.match(
      text,
      /PROVIDER_PLAIN_DEFAULTS[\s\S]*kelkoo[\s\S]*KELKOO_COUNTRY/,
    );
  });

  it('FR-142/143 pins use 16 primary/DLQ floors (kelkoo+aliexpress)', () => {
    const fr142 = utf8NoBom(path.join('tests', 'fr142-sqs-dlq.test.js'));
    const fr143 = utf8NoBom(
      path.join('tests', 'fr143-cw-retention-dlq-alarm.test.js'),
    );
    assert.match(fr142, /expected 16 primary queues/);
    assert.match(fr143, /expected 16 DLQ depth alarms/);
    assert.match(fr142, /'kelkoo'/);
    assert.match(fr142, /'aliexpress'/);
  });

  it('stay-dark pins exclude kelkoo; DEFAULT_ON includes kelkoo; Decision LOCKED', () => {
    const fr166 = utf8NoBom(
      path.join('tests', 'fr166-phase4-enablement-index.test.js'),
    );
    assert.doesNotMatch(
      fr166,
      /PHASE2_STUB_IDS\s*=\s*\[[^\]]*'\s*kelkoo\s*'/,
    );
    const reg = utf8NoBom(path.join('tests', 'registry.test.js'));
    assert.match(reg, /DEFAULT_ON[\s\S]*'kelkoo'/);
    const fr = utf8NoBom(path.join('docs', 'fr', 'FR-167.md'));
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /kelkoo/i);
    const matrix = utf8NoBom(path.join('docs', 'secrets-matrix.md'));
    assert.match(matrix, /KELKOO_API_KEY/);
    assert.doesNotMatch(matrix, /Stay-dark omitted[\s\S]*\bkelkoo\b/i);
  });
});
