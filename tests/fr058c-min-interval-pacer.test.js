'use strict';

/**
 * FR-058c: shared pacing helper — two calls spaced >= minIntervalMs (fake clock).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createMinIntervalPacer,
  minIntervalMsFromMessagesPerSecond,
} = require('../shared/pacing/minInterval');

const root = path.join(__dirname, '..');

describe('FR-058c createMinIntervalPacer', () => {
  it('spaces two waits by >= minIntervalMs under fake clock', async () => {
    let t = 0;
    const sleeps = [];
    const pacer = createMinIntervalPacer({
      minIntervalMs: 100,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });

    await pacer.wait();
    assert.deepEqual(sleeps, []);
    assert.equal(t, 0);

    t += 40;
    await pacer.wait();
    assert.deepEqual(sleeps, [60]);
    assert.equal(t, 100);

    t += 100;
    await pacer.wait();
    assert.deepEqual(sleeps, [60]);
  });

  it('minIntervalMs 0 never sleeps', async () => {
    const sleeps = [];
    const pacer = createMinIntervalPacer({
      minIntervalMs: 0,
      now: () => 0,
      sleep: async (ms) => sleeps.push(ms),
    });
    await pacer.wait();
    await pacer.wait();
    assert.deepEqual(sleeps, []);
  });

  it('reset clears last-call so next wait is immediate', async () => {
    let t = 0;
    const sleeps = [];
    const pacer = createMinIntervalPacer({
      minIntervalMs: 50,
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    });
    await pacer.wait();
    t += 10;
    pacer.reset();
    await pacer.wait();
    assert.deepEqual(sleeps, []);
  });

  it('minIntervalMsFromMessagesPerSecond converts rate', () => {
    assert.equal(minIntervalMsFromMessagesPerSecond(4), 250);
    assert.equal(minIntervalMsFromMessagesPerSecond(0), 0);
  });

  it('shared package files list includes pacing/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(
      (pkg.files || []).some((f) => String(f).includes('pacing')),
      'shared/package.json files must list pacing/',
    );
  });
});
