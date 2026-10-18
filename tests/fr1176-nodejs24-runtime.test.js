'use strict';

/**
 * FR-1176 / #1176: bump all CDK Lambdas off deprecated nodejs20.x to nodejs24.x
 * before AWS creation disable (2027-02-01).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const STACK = path.join(root, 'cdk', 'lib', 'a-search-stack.js');

describe('FR-1176 Lambda runtime nodejs24.x', () => {
  it('stack source uses NODEJS_24_X and has zero NODEJS_20_X', () => {
    const text = fs.readFileSync(STACK, 'utf8');
    assert.match(text, /lambda\.Runtime\.NODEJS_24_X/);
    assert.equal(
      (text.match(/lambda\.Runtime\.NODEJS_20_X/g) || []).length,
      0,
      'no NODEJS_20_X left in a-search-stack.js',
    );
    // Contiguous count: every Function/NodejsFunction runtime pin is 24.
    const pins = text.match(/runtime:\s*lambda\.Runtime\.NODEJS_\d+_X/g) || [];
    assert.ok(pins.length >= 8, `expected >=8 runtime pins, got ${pins.length}`);
    for (const p of pins) {
      assert.match(p, /NODEJS_24_X/);
    }
  });

  it('aws-cdk-lib exports NODEJS_24_X as nodejs24.x', () => {
    const lambda = require('aws-cdk-lib/aws-lambda');
    assert.ok(lambda.Runtime.NODEJS_24_X, 'NODEJS_24_X missing from aws-cdk-lib');
    assert.equal(lambda.Runtime.NODEJS_24_X.name, 'nodejs24.x');
  });
});
