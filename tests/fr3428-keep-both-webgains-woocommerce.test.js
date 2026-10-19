'use strict';

/**
 * FR #3428: when webgains (FR-173) and woocommerce (FR-180) both land,
 * both stay enabled in the registry. FR-3949: they share a-search-db-backed
 * (no per-source worker queues); marketplace floors are 7 x live+sandbox = 14.
 * Shop-sync FIFO queues are excluded from the worker floor.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-3428 keep-both webgains and woocommerce', () => {
  it('both providers enabled; admitad and flexoffers stay dark; FR-3949 marketplace floors 14', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const id of ['webgains', 'woocommerce', 'wix']) {
      const s = byId.get(id);
      assert.ok(s, id);
      assert.equal(s.enabled.live, true, id);
      assert.equal(s.enabled.sandbox, true, id);
    }
    for (const id of ['admitad', 'flexoffers']) {
      const s = byId.get(id);
      assert.equal(s.enabled.live, false, id);
      assert.equal(s.enabled.sandbox, false, id);
    }
    const both = registry.sources.filter(
      (s) => s.enabled && s.enabled.live && s.enabled.sandbox,
    );
    assert.equal(both.length, 15);
    const fr142 = fs.readFileSync(
      path.join(root, 'tests', 'fr142-sqs-dlq.test.js'),
      'utf8',
    );
    // FR-3949: marketplace-only worker floors; webgains/woocommerce are DB-backed.
    assert.match(fr142, /expected 12 marketplace primary queues/);
    assert.match(fr142, /a-search-db-backed/);
    assert.doesNotMatch(fr142, /expected 30 primary queues/);
    const fr143 = fs.readFileSync(
      path.join(root, 'tests', 'fr143-cw-retention-dlq-alarm.test.js'),
      'utf8',
    );
    assert.match(fr143, /expected 12 marketplace DLQ depth alarms/);
    // FR #4451: skimlinks left AWS; 6 search providers x live+sandbox = 12 (was 14).
    assert.match(fr143, /workerDlqAlarms\.length,\s*12,/);
    assert.doesNotMatch(fr143, /expected 30 DLQ depth alarms/);
  });
});
