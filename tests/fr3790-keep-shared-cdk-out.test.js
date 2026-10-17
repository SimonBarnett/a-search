'use strict';

/**
 * FR #3790: the FR #3763 sweep must not delete the FR #3764 shared synth cache.
 * cdk.out-shared-* stays across batches; named cdk.out-fr* and private dirs still go.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isCdkOutStar,
  registerCdkOutDir,
  cleanupRegisteredCdkOutDirs,
  sweepCdkOutDirs,
} = require('./helpers/cdkOutCleanup');

describe('FR #3790 keep cdk.out-shared-*', () => {
  it('isCdkOutStar skips the shared cache and still matches named dirs', () => {
    assert.equal(isCdkOutStar('cdk.out-shared-default'), false);
    assert.equal(isCdkOutStar('cdk.out-shared-stage-dev'), false);
    assert.equal(isCdkOutStar('cdk.out-fr142'), true);
    assert.equal(isCdkOutStar('cdk.out-1234-1'), true);
    assert.equal(isCdkOutStar('cdk.out'), false);
  });

  it('sweepCdkOutDirs keeps cdk.out-shared-* and plain cdk.out', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3790-sweep-'));
    try {
      const shared = path.join(root, 'cdk.out-shared-default');
      const named = path.join(root, 'cdk.out-fr153-default');
      const plain = path.join(root, 'cdk.out');
      fs.mkdirSync(shared);
      fs.mkdirSync(named);
      fs.mkdirSync(plain);
      fs.writeFileSync(path.join(shared, 'ASearchStack.template.json'), '{}');
      const removed = sweepCdkOutDirs(root);
      assert.equal(removed.includes('cdk.out-shared-default'), false);
      assert.equal(fs.existsSync(shared), true);
      assert.equal(fs.existsSync(path.join(shared, 'ASearchStack.template.json')), true);
      assert.equal(fs.existsSync(named), false);
      assert.equal(fs.existsSync(plain), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('registerCdkOutDir does not delete a shared dir on cleanup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fr3790-reg-'));
    try {
      const shared = path.join(root, 'cdk.out-shared-default');
      fs.mkdirSync(shared);
      fs.writeFileSync(path.join(shared, 'ASearchStack.template.json'), '{}');
      registerCdkOutDir(shared);
      cleanupRegisteredCdkOutDirs();
      assert.equal(fs.existsSync(shared), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
