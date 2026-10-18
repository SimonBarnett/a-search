'use strict';

/**
 * MRB #4358: the Related bullet must match the FR #4357 omit rule.
 * Reserved concurrency 1 serialises workers; ESM MaximumConcurrency stays off.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const docPath = path.join(__dirname, '..', 'docs', 'sqs-pacing.md');

describe('MRB #4358 sqs-pacing Related bullet', () => {
  it('Related names reserved concurrency 1 and omitted MaximumConcurrency', () => {
    const raw = fs.readFileSync(docPath);
    assert.equal(raw[0], 0x23, 'docs/sqs-pacing.md must be UTF-8 without BOM');
    assert.equal(raw[raw.length - 1], 0x0a, 'docs/sqs-pacing.md must end with LF');
    const text = raw.toString('utf8').replace(/\r\n/g, '\n');
    const related = text.split('## Related')[1].split('## Out of scope')[0];
    assert.match(
      related,
      /batchSize: 1`; provider workers `reservedConcurrentExecutions: 1`; SQS `MaximumConcurrency` omitted, FR #4357/,
    );
    assert.doesNotMatch(related, /maxConcurrency` from registry/);
  });
});
