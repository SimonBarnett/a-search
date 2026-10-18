'use strict';

/**
 * FR #3479: widget-agent in_ready fires on IN/{searchId}.json.
 * Legacy in.json must not enqueue. IN/.processing and live.json must not.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classifyS3Key } = require('../shared/widgets/agentQueue');

const GUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ready = `sandbox/x/42/${GUID}/IN/search-1.json`;

describe('FR #3479 in_ready is IN/*.json', () => {
  it('classifies IN/{searchId}.json and rejects legacy, processing, and live.json', () => {
    const hit = classifyS3Key(ready);
    assert.equal(hit && hit.eventType, 'in_ready');
    assert.equal(hit.widgetGuid, GUID);
    assert.equal(hit.customerNumber, '42');
    assert.equal(
      classifyS3Key(`sandbox/x/42/${GUID}/in.json`),
      null,
    );
    assert.equal(
      classifyS3Key(`sandbox/x/42/${GUID}/IN/.processing/search-1.json`),
      null,
    );
    assert.equal(classifyS3Key(`sandbox/x/42/${GUID}/live.json`), null);
  });

  it('EventBridge rule matches IN/*.json and does not suffix-match legacy in.json', () => {
    const stack = fs.readFileSync(
      path.join(__dirname, '..', 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /wildcard:\s*'?\*\/IN\/\*\.json'?/);
    assert.doesNotMatch(stack, /['"]in\.json['"]/);
  });
});
