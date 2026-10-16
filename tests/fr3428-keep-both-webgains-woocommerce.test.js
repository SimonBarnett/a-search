'use strict';

/**
 * FR #3428: when webgains (FR-173) and woocommerce (FR-180) both land,
 * both stay enabled and worker floors are 15 x live+sandbox = 30.
 * Shop-sync FIFO queues are excluded from the worker floor.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-3428 keep-both webgains and woocommerce', () => {
  it('both providers enabled; admitad and flexoffers stay dark; floors 30', () => {
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
    assert.match(fr142, /expected 30 primary queues/);
    assert.match(fr142, /'webgains', 'woocommerce'/);
    const fr143 = fs.readFileSync(
      path.join(root, 'tests', 'fr143-cw-retention-dlq-alarm.test.js'),
      'utf8',
    );
    assert.match(fr143, /expected 30 DLQ depth alarms/);
  });
});
