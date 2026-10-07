'use strict';

/** FR-047d: assertEnv lives under shared/, not worker/lib */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

describe('FR-047d assertEnv in shared/', () => {
  it('shared/assertEnv.js exists; worker/lib copy gone', () => {
    assert.ok(fs.existsSync(path.join(root, 'shared', 'assertEnv.js')));
    assert.equal(
      fs.existsSync(path.join(root, 'worker', 'lib', 'assertEnv.js')),
      false,
    );
  });

  it('can require assertWorkerEnv from shared', () => {
    const { assertWorkerEnv, EnvIsolationError } = require('../shared/assertEnv');
    assert.equal(typeof assertWorkerEnv, 'function');
    assert.throws(
      () => assertWorkerEnv({ env: 'live' }, 'sandbox'),
      (err) => err instanceof EnvIsolationError && err.code === 'env_mismatch',
    );
  });
});
