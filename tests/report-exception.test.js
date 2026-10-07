'use strict';

/** FR-048a: shared/intake/reportException unit tests */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  reportException,
  buildIntakePayload,
  buildIdempotencyKey,
  clearReportExceptionDedupe,
  DEFAULT_INTAKE_URL,
  DEFAULT_REPO,
} = require('../shared/intake/reportException');

describe('FR-048a reportException', () => {
  beforeEach(() => {
    clearReportExceptionDedupe();
  });

  it('buildIntakePayload uses repo SimonBarnett/a-search and kind issue', () => {
    const err = new Error('boom');
    err.code = 'unit_boom';
    const payload = buildIntakePayload({ err, route: 'entry/POST /search' });
    assert.equal(payload.repo, DEFAULT_REPO);
    assert.equal(payload.kind, 'issue');
    assert.ok(payload.idempotency_key);
    assert.equal(payload.idempotency_key.length, 64);
    assert.match(payload.title, /unit_boom|boom/);
    assert.match(payload.body, /boom/);
  });

  it('idempotency_key is stable for same code+message+route', () => {
    const a = buildIdempotencyKey({
      code: 'X',
      message: 'm',
      route: 'r',
    });
    const b = buildIdempotencyKey({
      code: 'X',
      message: 'm',
      route: 'r',
    });
    const c = buildIdempotencyKey({
      code: 'X',
      message: 'm',
      route: 'other',
    });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('redacts Authorization and password-like tokens from body', () => {
    const err = new Error('Authorization: Bearer SECRETTOKEN password=hunter2');
    const payload = buildIntakePayload({ err, route: 'worker/amazon' });
    assert.doesNotMatch(payload.body, /SECRETTOKEN/);
    assert.doesNotMatch(payload.body, /hunter2/);
    assert.match(payload.body, /\[REDACTED\]/);
  });

  it('mock fetch POST called once with repo a-search', async () => {
    const calls = [];
    const fetchMock = async (url, init) => {
      calls.push({ url, init });
      return { status: 202, text: async () => '{"ok":true}' };
    };
    const err = new Error('fatal path');
    err.code = 'fatal_path';
    const result = await reportException({
      err,
      route: 'worker/amazon',
      fetch: fetchMock,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, DEFAULT_INTAKE_URL);
    assert.equal(calls[0].init.method, 'POST');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.repo, 'SimonBarnett/a-search');
    assert.equal(body.kind, 'issue');
    assert.equal(body.idempotency_key, result.payload.idempotency_key);
    assert.equal(result.ok, true);
  });

  it('same idempotency_key second call skips duplicate POST', async () => {
    const calls = [];
    const fetchMock = async (url, init) => {
      calls.push({ url, init });
      return { status: 202, text: async () => '{}' };
    };
    const err = new Error('dup');
    err.code = 'dup_code';
    const first = await reportException({
      err,
      route: 'maintainer',
      fetch: fetchMock,
    });
    const second = await reportException({
      err,
      route: 'maintainer',
      fetch: fetchMock,
    });
    assert.equal(calls.length, 1);
    assert.equal(second.skipped, true);
    assert.equal(second.payload.idempotency_key, first.payload.idempotency_key);
    assert.deepEqual(
      {
        kind: second.payload.kind,
        repo: second.payload.repo,
        idempotency_key: second.payload.idempotency_key,
      },
      {
        kind: first.payload.kind,
        repo: first.payload.repo,
        idempotency_key: first.payload.idempotency_key,
      },
    );
  });
});
