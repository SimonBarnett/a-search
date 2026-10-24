'use strict';

/**
 * FR #4882: UAT S19 live /selftest probe -- dedicated smoke (GET + POST),
 * fail-closed without URL/JWT, never prints a token.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'smoke-selftest.js');

function fakeJwt() {
  const h = Buffer.from('{"alg":"none"}', 'utf8').toString('base64url');
  const p = Buffer.from('{"userId":"uat-s19"}', 'utf8').toString('base64url');
  return [h, p, 'sig'].join('.');
}

function mockFetchSequence(replies) {
  let i = 0;
  return async function fetchImpl(url, init) {
    const rec = replies[i++];
    if (!rec) {
      throw new Error('unexpected extra fetch ' + url);
    }
    return {
      status: rec.status,
      text: async () => rec.body,
      url,
      method: (init && init.method) || 'GET',
    };
  };
}

describe('FR #4882 smoke-selftest', () => {
  it('exports runSelftestSmoke and require GET plus POST', async () => {
    const smoke = require(SCRIPT);
    assert.equal(typeof smoke.runSelftestSmoke, 'function');
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), method: (init && init.method) || 'GET' });
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            ok: true,
            providers: [{ id: 'awin', ok: true }],
          }),
      };
    };
    const out = await smoke.runSelftestSmoke({
      baseUrl: 'https://example.invalid/search-api',
      jwt: fakeJwt(),
      fetchImpl,
    });
    assert.equal(out.ok, true);
    assert.equal(out.providers, 1);
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/selftest/);
    assert.equal(calls[0].method, 'GET');
    assert.match(calls[1].url, /\/selftest$/);
    assert.equal(calls[1].method, 'POST');
  });

  it('fail-closes when API URL or JWT is missing', async () => {
    const smoke = require(SCRIPT);
    await assert.rejects(
      () => smoke.runSelftestSmoke({ baseUrl: '', jwt: fakeJwt() }),
      /A_SEARCH_API_URL|base URL/,
    );
    await assert.rejects(
      () =>
        smoke.runSelftestSmoke({
          baseUrl: 'https://example.invalid/search-api',
          jwt: '',
        }),
      /A_SEARCH_SMOKE_JWT|JWT/,
    );
  });

  it('CLI without env exits 1 and does not print Bearer token', () => {
    const r = spawnSync(process.execPath, [SCRIPT], {
      cwd: ROOT,
      env: { ...process.env, A_SEARCH_API_URL: '', A_SEARCH_SMOKE_JWT: '' },
      encoding: 'utf8',
    });
    assert.notEqual(r.status, 0);
    const blob = String(r.stdout || '') + String(r.stderr || '');
    assert.doesNotMatch(blob, /Bearer\s+\S{8,}/);
    assert.doesNotMatch(blob, /eyJ[A-Za-z0-9_-]{20,}\./);
  });

  it('rejects non-200 /selftest', async () => {
    const smoke = require(SCRIPT);
    await assert.rejects(
      () =>
        smoke.runSelftestSmoke({
          baseUrl: 'https://example.invalid/search-api',
          jwt: fakeJwt(),
          fetchImpl: mockFetchSequence([
            { status: 401, body: '{"ok":false,"error":"unauthorized"}' },
          ]),
        }),
      /401/,
    );
  });
});
