'use strict';

/**
 * FR-144: post-deploy smoke script — mocked fetch pins (no live network).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'scripts', 'smoke-deploy.js');

/** Fixture token — FAKE_ parts only (never a realistic JWT literal). */
const FAKE_JWT = ['FAKE', 'smoke', 'token'].join('.');

function mockFetchSequence(handlers) {
  let i = 0;
  return async (url, init) => {
    const h = handlers[i++];
    assert.ok(h, `unexpected fetch #${i} ${url}`);
    return h(String(url), init || {});
  };
}

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('FR-144 post-deploy smoke script', () => {
  it('script exports runSmoke + documents CLI env knobs', () => {
    assert.ok(fs.existsSync(scriptPath), 'scripts/smoke-deploy.js missing');
    const text = fs.readFileSync(scriptPath, 'utf8');
    assert.match(text, /FR-144/);
    assert.match(text, /A_SEARCH_API_URL/);
    assert.match(text, /A_SEARCH_SMOKE_JWT/);
    assert.match(text, /function runSmoke/);
    assert.match(text, /\/search/);
    assert.match(text, /\/selftest/);
    // Must not embed a realistic contiguous JWT / Bearer secret
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\./);
  });

  it('runSmoke: mocked 200 accept + selftest shape exits ok', async () => {
    const {
      runSmoke,
      DEFAULT_SEARCH_BODY,
    } = require('../scripts/smoke-deploy');

    const fetchImpl = mockFetchSequence([
      (url, init) => {
        assert.match(url, /\/search$/);
        assert.equal(init.method, 'POST');
        assert.match(String(init.headers.Authorization), /^Bearer FAKE\.smoke\.token$/);
        const body = JSON.parse(init.body);
        assert.equal(body.q, DEFAULT_SEARCH_BODY.q);
        return jsonResponse(200, {
          accepted: true,
          searchId: 'srch_smoke_fixture',
          userId: 'FAKE_USER',
          env: 'sandbox',
          enqueued: ['amazon'],
        });
      },
      (url, init) => {
        assert.match(url, /\/selftest/);
        assert.equal(init.method, 'GET');
        assert.match(String(init.headers.Authorization), /^Bearer /);
        return jsonResponse(200, {
          ok: true,
          userId: 'FAKE_USER',
          env: 'sandbox',
          providers: [
            { id: 'amazon', ok: true },
            { id: 'ebay', ok: false, error: 'fixture_probe_skip' },
          ],
          failed: ['ebay'],
          intakeFiled: [],
        });
      },
    ]);

    const result = await runSmoke({
      fetchImpl,
      baseUrl: 'https://example.test/api',
      jwt: FAKE_JWT,
    });
    assert.equal(result.ok, true);
    assert.equal(result.searchId, 'srch_smoke_fixture');
    assert.equal(result.providers, 2);
  });

  it('runSmoke: non-200 /search fails; missing jwt fails', async () => {
    const { runSmoke, requireJwt } = require('../scripts/smoke-deploy');
    assert.throws(() => requireJwt(''), /missing fixture JWT/);

    const fetchImpl = mockFetchSequence([
      () =>
        jsonResponse(401, { accepted: false, error: 'unauthorized' }),
    ]);
    await assert.rejects(
      () =>
        runSmoke({
          fetchImpl,
          baseUrl: 'https://example.test',
          jwt: FAKE_JWT,
        }),
      /expected HTTP 200/,
    );
  });

  it('runSmoke: selftest missing providers shape fails', async () => {
    const { runSmoke } = require('../scripts/smoke-deploy');
    const fetchImpl = mockFetchSequence([
      () =>
        jsonResponse(200, {
          accepted: true,
          searchId: 'srch_x',
          userId: 'FAKE_USER',
          env: 'sandbox',
          enqueued: [],
        }),
      () => jsonResponse(200, { ok: true }),
    ]);
    await assert.rejects(
      () =>
        runSmoke({
          fetchImpl,
          baseUrl: 'https://example.test',
          jwt: FAKE_JWT,
        }),
      /providers array/,
    );
  });

  it('CLI missing url/jwt exits 1 without printing secrets', () => {
    const r = spawnSync(process.execPath, [scriptPath], {
      encoding: 'utf8',
      env: { ...process.env, A_SEARCH_API_URL: '', A_SEARCH_SMOKE_JWT: '' },
    });
    assert.equal(r.status, 1);
    assert.match(String(r.stderr), /FR-144/);
    assert.doesNotMatch(String(r.stdout) + String(r.stderr), /eyJ/);
  });

  it('docs: FR-144 Decision LOCKED + deploy.md script + release-gap Yes', () => {
    const fr = fs.readFileSync(path.join(root, 'docs', 'fr', 'FR-144.md'), 'utf8');
    assert.match(fr, /Decision\s*\(LOCKED\)/i);
    assert.match(fr, /smoke-deploy\.js/);
    assert.match(fr, /fr144-smoke-deploy\.test\.js/);

    const deploy = fs.readFileSync(path.join(root, 'docs', 'deploy.md'), 'utf8');
    assert.match(deploy, /smoke-deploy\.js/);
    assert.match(deploy, /A_SEARCH_API_URL|A_SEARCH_SMOKE_JWT/);
    assert.doesNotMatch(deploy, /Automated post-deploy smoke script is \*\*FR-144\*\* \(out of scope here\)/);

    const gap = fs.readFileSync(
      path.join(root, 'docs', 'release-gap-aws-installable-2026-10-09.md'),
      'utf8',
    );
    assert.match(gap, /\|\s*Post-deploy smoke\s*\|\s*\*\*Yes\*\*/);
  });
});
