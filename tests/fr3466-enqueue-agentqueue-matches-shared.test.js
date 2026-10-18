'use strict';

/**
 * FR #3466: the enqueue Lambda copy of agentQueue.js must stay equal to
 * shared/widgets/agentQueue.js. The FR-258 suite imports only the shared
 * module, and enqueue/index.js requires the local copy.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const sharedPath = path.join(ROOT, 'shared', 'widgets', 'agentQueue.js');
const enqueuePath = path.join(
  ROOT,
  'components-piece',
  'dispatcher',
  'enqueue',
  'agentQueue.js',
);
const enqueueIndexPath = path.join(
  ROOT,
  'components-piece',
  'dispatcher',
  'enqueue',
  'index.js',
);

describe('FR #3466 enqueue agentQueue matches shared', () => {
  it('byte-compares the enqueue copy to shared/widgets/agentQueue.js', () => {
    const shared = fs.readFileSync(sharedPath);
    const enqueue = fs.readFileSync(enqueuePath);
    assert.ok(shared.length > 0, 'shared agentQueue.js is empty');
    assert.deepEqual(enqueue, shared);
  });

  it('enqueue/index.js still requires the local agentQueue copy', () => {
    const index = fs.readFileSync(enqueueIndexPath, 'utf8');
    assert.match(index, /require\('\.\/agentQueue'\)/);
  });
});
