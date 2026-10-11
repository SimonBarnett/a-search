'use strict';

/**
 * MRB #1404 docs/hostile: FR-172 enable partnerize live+sandbox + FR-138 secret wiring.
 * Pins survive keep-both with FR-167..170 (11 enabled -> 22 queues); bol stays dark.
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

describe('MRB #1404 hostile FR-172 enable partnerize', () => {
  it('registry: partnerize both envs true; bol stays dark; etsy+skimlinks enabled', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('partnerize').enabled.live, true);
    assert.equal(byId.get('partnerize').enabled.sandbox, true);
    assert.equal(byId.get('bol').enabled.live, false, 'FR-171 still open');
    assert.equal(byId.get('etsy').enabled.live, true, 'FR-170');
    assert.equal(byId.get('skimlinks').enabled.live, true, 'FR-168');
  });

  it('stack wires PROVIDER_CREDENTIAL_KEYS.partnerize', () => {
    const text = utf8NoBom(path.join('cdk', 'lib', 'a-search-stack.js'));
    assert.match(
      text,
      /PROVIDER_CREDENTIAL_KEYS[\s\S]*partnerize[\s\S]*PARTNERIZE_API_KEY/,
    );
    assert.match(text, /PARTNERIZE_PUBLISHER_ID/);
  });

  it('FR-142/143 pins use 22 primary/DLQ floors (11 enabled x 2)', () => {
    const fr142 = utf8NoBom(path.join('tests', 'fr142-sqs-dlq.test.js'));
    const fr143 = utf8NoBom(
      path.join('tests', 'fr143-cw-retention-dlq-alarm.test.js'),
    );
    assert.match(fr142, /expected 24 primary queues/);
    assert.match(fr143, /expected 24 DLQ depth alarms/);
    assert.match(fr142, /'partnerize'/);
  });

  it('stay-dark stubs exclude partnerize; Decision LOCKED', () => {
    const fr166 = utf8NoBom(
      path.join('tests', 'fr166-phase4-enablement-index.test.js'),
    );
    assert.doesNotMatch(
      fr166,
      /PHASE2_STUB_IDS\s*=\s*\[[^\]]*'\s*partnerize\s*'/,
    );
    const mrb668 = utf8NoBom(
      path.join('tests', 'mrb668-hostile-fr061-phase2-stay-dark.test.js'),
    );
    assert.match(mrb668, /exactly 8 Phase-2 stub ids stay dark/);
    assert.match(mrb668, /stubs\.length,\s*8/);
    const fr = utf8NoBom(path.join('docs', 'fr', 'FR-172.md'));
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /partnerize/i);
  });
});
