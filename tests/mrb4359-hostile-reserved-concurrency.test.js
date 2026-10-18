'use strict';
/**
 * MRB #4359: reserved concurrency 1 must not set SQS MaximumConcurrency.
 * Newlines are normalized so LF and CRLF checkouts share one window.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const book = fs.readFileSync(
  path.join(__dirname, '..', '.grok', 'skills', 'harvest-agent-skills', 'SKILL.md'),
  'utf8',
).replace(/\r\n/g, '\n');

const prior = 'When provider secret wiring is skipped unless the context ARN is real, update every synth pin that still requires the placeholder credential env. Plain defaults and queues stay.';
const lesson = 'When a Lambda reserved concurrency is 1, do not set SQS event source MaximumConcurrency. The AWS floor is 2, and Lambda rejects a maximum above the reserve. Reserved concurrency already serialises the worker.';

describe('MRB #4359 reserved concurrency lesson', () => {
  it('keeps the provider-secret bullet and appends the MaximumConcurrency bullet', () => {
    assert.ok(book.includes(prior + '\n- ' + lesson), 'contiguous prior bullet then new lesson');
    assert.equal(book.includes('\uFEFF'), false);
  });
});
