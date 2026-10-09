'use strict';

/**
 * MRB #1202 docs/hostile: FR-143 CloudWatch 30d LogGroup + DLQ depth alarms.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

describe('MRB #1202 hostile FR-143 CloudWatch retention + DLQ alarms', () => {
  it('stack wires LogGroup ONE_MONTH, SNS placeholder, DLQ depth alarms', () => {
    const text = fs.readFileSync(
      path.join(root, 'cdk/lib/a-search-stack.js'),
      'utf8',
    );
    assert.match(text, /FR-143/);
    assert.match(text, /function lambdaLogGroup/);
    assert.match(text, /RetentionDays\.ONE_MONTH/);
    assert.match(text, /logGroup:\s*lambdaLogGroup/);
    assert.match(text, /a-search-ops-alarms/);
    assert.match(text, /metricApproximateNumberOfMessagesVisible/);
    assert.match(text, /SnsAction/);
    assert.doesNotMatch(text, /https:\/\/hooks\./i);
  });

  it('FR-143 Decision LOCKED + release-gap CloudWatch Yes + pin file', () => {
    const fr = fs.readFileSync(path.join(root, 'docs/fr/FR-143.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /fr143-cw-retention-dlq-alarm\.test\.js/);
    const gap = fs.readFileSync(
      path.join(root, 'docs/release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*CloudWatch retention \/ alarms\s*\|\s*\*\*Yes\*\*/);
    assert.ok(
      fs.existsSync(path.join(root, 'tests/fr143-cw-retention-dlq-alarm.test.js')),
    );
  });
});