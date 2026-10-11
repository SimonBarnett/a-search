'use strict';

/**
 * MRB #1404 docs/hostile: FR-172 enable partnerize live+sandbox + FR-138 secret wiring.
 * Keep-both with FR-171 bol => 12 enabled -> 24 queues.
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
  it('registry: partnerize both envs true; bol also enabled; etsy+skimlinks enabled', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('partnerize').enabled.live, true);
    assert.equal(byId.get('partnerize').enabled.sandbox, true);
    assert.equal(byId.get('bol').enabled.live, true, 'FR-171 keep-both');
    assert.equal(byId.get('bol').enabled.sandbox, true, 'FR-171 keep-both');
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

  it('FR-142/143 pins use 28 primary/DLQ floors (14 enabled x 2)', () => {
    const fr142 = utf8NoBom(path.join('tests', 'fr142-sqs-dlq.test.js'));
    const fr143 = utf8NoBom(
      path.join('tests', 'fr143-cw-retention-dlq-alarm.test.js'),
    );
    assert.match(fr142, /expected 28 primary queues/);
    assert.match(fr143, /expected 28 DLQ depth alarms/);
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
    assert.match(mrb668, /exactly 6 Phase-2 stub ids stay dark/);
    assert.match(mrb668, /stubs\.length,\s*6/);
    const fr = utf8NoBom(path.join('docs', 'fr', 'FR-172.md'));
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /partnerize/i);
  });
});
