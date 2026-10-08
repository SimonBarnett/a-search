'use strict';

/**
 * FR-058b: optional registry rateLimit fields (amazon example) via loadRegistry.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  loadRegistry,
  rateLimit,
} = require('../providers/loadRegistry');

const root = path.join(__dirname, '..');

describe('FR-058b registry rateLimit', () => {
  it('amazon source exposes rateLimit maxConcurrency + minIntervalMs', () => {
    const registry = loadRegistry();
    const amazon = registry.sources.find((s) => s.id === 'amazon');
    assert.ok(amazon, 'amazon source required');
    assert.ok(amazon.rateLimit && typeof amazon.rateLimit === 'object');
    assert.equal(amazon.rateLimit.maxConcurrency, 1);
    assert.equal(amazon.rateLimit.minIntervalMs, 250);
    const viaHelper = rateLimit('amazon');
    assert.deepEqual(viaHelper, amazon.rateLimit);
  });

  it('rateLimit(id) is undefined for sources without the field', () => {
    // Stay-dark locals without a selftest FR yet (wix gained rateLimit in FR-108).
    assert.equal(rateLimit('woocommerce'), undefined);
  });

  it('add-source.md documents optional rateLimit', () => {
    const text = fs.readFileSync(
      path.join(root, 'docs', 'add-source.md'),
      'utf8',
    );
    assert.match(text, /rateLimit/);
    assert.match(text, /maxConcurrency|minIntervalMs|messagesPerSecond/);
  });
});
