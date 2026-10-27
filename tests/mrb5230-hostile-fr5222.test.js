'use strict';

/**
 * MRB #5230 hostile pin: DLQ filer never consumes/redrives; fixture skip stays on.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const FILER = path.join(ROOT, 'shared/intake/reportDlqFailure.js');
const HANDLE = path.join(ROOT, 'shared/search/handleSqsWith429.js');
const DRAIN = path.join(ROOT, 'walrus/src/drainRunner.js');

const {
  isTestFixtureDlqContext,
  reportDlqFailure,
  clearDlqFailureDedupe,
} = require('../shared/intake/reportDlqFailure');

describe('MRB #5230 hostile FR #5222', () => {
  it('filer and handleSqs never StartMessageMoveTask / PurgeQueue / receiveMessage', () => {
    const filer = fs.readFileSync(FILER, 'utf8');
    const handle = fs.readFileSync(HANDLE, 'utf8');
    const drain = fs.readFileSync(DRAIN, 'utf8');
    const banned = /StartMessageMoveTask|PurgeQueue|\.receiveMessage\s*\(/;
    assert.doesNotMatch(filer, banned);
    assert.match(handle, /reportDlqFailure/);
    assert.match(drain, /reportDlqFailure/);
    assert.match(filer, /isTestFixtureDlqContext/);
  });

  it('club.example + sqs.example without fetch skips live intake', async () => {
    clearDlqFailureDedupe();
    let posts = 0;
    const prev = global.fetch;
    global.fetch = async () => {
      posts += 1;
      return { status: 202, text: async () => '{}' };
    };
    try {
      assert.equal(
        isTestFixtureDlqContext({
          host: 'club.example',
          queueUrl: 'https://sqs.example/source.fifo',
        }),
        true,
      );
      const out = await reportDlqFailure({
        provider: 'rakuten',
        searchid: 'srch_mrb5230',
        host: 'club.example',
        queueUrl: 'https://sqs.example/source.fifo',
        dlqUrl: 'https://sqs.example/source-dlq.fifo',
        err: Object.assign(new Error('INVALID_CONTEXT'), {
          code: 'rakuten_invalid_context',
        }),
      });
      assert.equal(out.skipped, true);
      assert.equal(out.reason, 'test_fixture_no_intake');
      assert.equal(posts, 0);
    } finally {
      global.fetch = prev;
    }
  });
});
