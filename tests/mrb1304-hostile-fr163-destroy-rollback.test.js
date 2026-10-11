'use strict';

/** Hostile pins for MRB #1304 / FR-163 destroy-rollback playbook. */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const playbook = path.join(root, 'docs', 'destroy-rollback.md');
const deploy = path.join(root, 'docs', 'deploy.md');
const fr = path.join(root, 'docs', 'fr', 'FR-163.md');
const gap = path.join(root, 'docs', 'release-gap-pass2-2026-10-09.md');
const stack = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('MRB-1304 hostile FR-163 destroy-rollback', () => {
  it('playbook contiguous RETAIN + order + no-secret rule', () => {
    const text = fs.readFileSync(playbook, 'utf8');
    assert.ok(text.includes('## Results bucket: RETAIN (LOCKED)'));
    assert.ok(text.includes('removalPolicy: cdk.RemovalPolicy.RETAIN'));
    assert.ok(text.includes('autoDeleteObjects: false'));
    assert.ok(text.includes('## Order of operations (safe teardown)'));
    assert.ok(text.includes('## What ops must retain (outside the stack)'));
    assert.ok(text.includes('Never') && text.includes('secret'));
    assert.ok(text.includes('smoke-deploy') || text.includes('FR-144'));
    assert.ok(!text.startsWith('\uFEFF'));
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/);
  });

  it('deploy.md section 11 FR-163 + Decision LOCKED + release-gap Yes', () => {
    const deployText = fs.readFileSync(deploy, 'utf8');
    assert.ok(deployText.includes('## 11. Destroy / rollback (FR-163)'));
    assert.ok(deployText.includes('destroy-rollback.md'));

    const frText = fs.readFileSync(fr, 'utf8');
    assert.ok(frText.includes('## Decision (LOCKED)'));

    const gapText = fs.readFileSync(gap, 'utf8');
    assert.match(
      gapText,
      /Destroy\/rollback docs \| FR-163 \| #1006 \(\*\*Yes\*\* - destroy-rollback\.md \+ pointers; pin fr163\)/,
    );
  });

  it('stack still RETAIN + autoDeleteObjects false for results bucket', () => {
    const stackText = fs.readFileSync(stack, 'utf8');
    assert.ok(stackText.includes('removalPolicy: cdk.RemovalPolicy.RETAIN'));
    assert.ok(stackText.includes('autoDeleteObjects: false'));
  });
});