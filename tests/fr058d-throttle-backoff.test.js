'use strict';

/**
 * FR-058d: 407/429 classifier + backoff (no tight in-process retry).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  ProviderThrottleError,
  isThrottleStatus,
  parseRetryAfterMs,
  classifyHttpThrottle,
  backoffOnHttpThrottle,
} = require('../shared/pacing/throttleBackoff');

const root = path.join(__dirname, '..');

describe('FR-058d throttle backoff', () => {
  it('isThrottleStatus true for 407 and 429 only', () => {
    assert.equal(isThrottleStatus(407), true);
    assert.equal(isThrottleStatus(429), true);
    assert.equal(isThrottleStatus(200), false);
    assert.equal(isThrottleStatus(500), false);
  });

  it('429 with Retry-After seconds → backoff then throw (no tight loop)', async () => {
    const sleeps = [];
    let httpCalls = 0;
    const res = {
      status: 429,
      headers: { 'Retry-After': '2' },
    };

    await assert.rejects(
      async () => {
        httpCalls += 1;
        await backoffOnHttpThrottle(res, {
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        });
        httpCalls += 1; // must not run — would be a tight retry
      },
      (err) => {
        assert.ok(err instanceof ProviderThrottleError);
        assert.equal(err.status, 429);
        assert.equal(err.retryAfterMs, 2000);
        return true;
      },
    );

    assert.deepEqual(sleeps, [2000]);
    assert.equal(httpCalls, 1, 'helper must not re-invoke HTTP itself');
  });

  it('407 without Retry-After uses defaultBackoffMs', async () => {
    const sleeps = [];
    await assert.rejects(
      () =>
        backoffOnHttpThrottle(
          { statusCode: 407, headers: {} },
          {
            defaultBackoffMs: 1500,
            sleep: async (ms) => sleeps.push(ms),
          },
        ),
      ProviderThrottleError,
    );
    assert.deepEqual(sleeps, [1500]);
  });

  it('non-throttle status returns false without sleep', async () => {
    const sleeps = [];
    const out = await backoffOnHttpThrottle(
      { status: 200 },
      { sleep: async (ms) => sleeps.push(ms) },
    );
    assert.equal(out, false);
    assert.deepEqual(sleeps, []);
  });

  it('classifyHttpThrottle caps at maxBackoffMs', () => {
    const c = classifyHttpThrottle(
      { status: 429, headers: { 'retry-after': '999' } },
      { maxBackoffMs: 5000 },
    );
    assert.equal(c.throttle, true);
    assert.equal(c.retryAfterMs, 5000);
  });

  it('parseRetryAfterMs accepts HTTP-date', () => {
    const now = () => Date.parse('Wed, 08 Oct 2026 12:00:00 GMT');
    const ms = parseRetryAfterMs('Wed, 08 Oct 2026 12:00:05 GMT', now);
    assert.equal(ms, 5000);
  });

  it('shared package files list includes pacing/', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok(
      (pkg.files || []).some((f) => String(f).includes('pacing')),
      'shared/package.json files must list pacing/',
    );
  });
});
