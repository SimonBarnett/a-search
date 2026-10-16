'use strict';

/**
 * Hostile pins for FR-173 / #1020 enable webgains (successor tip for MRB #1568).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('MRB-1568 FR-173 hostile', () => {
  it('registry webgains enabled both envs; admitad still dark', () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'providers', 'registry.json'), 'utf8'),
    );
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.equal(byId.get('webgains').enabled.live, true);
    assert.equal(byId.get('webgains').enabled.sandbox, true);
    assert.equal(byId.get('admitad').enabled.live, false);
    assert.equal(byId.get('flexoffers').enabled.live, false);
    const both = registry.sources.filter(
      (s) => s.enabled && s.enabled.live && s.enabled.sandbox,
    );
    assert.equal(both.length, 15);
  });

  it('FR-173 Decision LOCKED ASCII; secrets-matrix lists WEBGAINS_API_KEY', () => {
    const buf = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-173.md'));
    assert.notEqual(buf[0], 0xef);
    const fr = buf.toString('utf8');
    assert.ok(!/[^\x09\x0A\x0D\x20-\x7E]/.test(fr));
    assert.match(fr, /Decision \(LOCKED\)/);
    assert.match(fr, /WEBGAINS_API_KEY/);
    const matrix = fs.readFileSync(
      path.join(root, 'docs', 'secrets-matrix.md'),
      'utf8',
    );
    assert.match(matrix, /WEBGAINS_API_KEY/);
    assert.doesNotMatch(matrix, /Stay-dark omitted[\s\S]*\bwebgains\b/i);
  });

  it('fr142/fr143 floors expect 28 primaries after wix+webgains keep-both', () => {
    const fr142 = fs.readFileSync(
      path.join(root, 'tests', 'fr142-sqs-dlq.test.js'),
      'utf8',
    );
    assert.match(fr142, /expected 30 primary queues/);
    const fr143 = fs.readFileSync(
      path.join(root, 'tests', 'fr143-cw-retention-dlq-alarm.test.js'),
      'utf8',
    );
    assert.match(fr143, /expected 30 DLQ depth alarms/);
  });
});
