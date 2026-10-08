'use strict';

/**
 * FR-059e: probe ok=false files a-search intake once; identical failure deduped.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  reportSelftestFailure,
  reportSelftestFailures,
  selftestIdempotencyKey,
  clearSelftestFailureDedupe,
  DEFAULT_REPO,
} = require('../shared/selftest/reportSelftestFailure');

const root = path.join(__dirname, '..');

describe('FR-059e selftest failure intake', () => {
  beforeEach(() => {
    clearSelftestFailureDedupe();
  });

  it('failing probe causes one intake POST with repo SimonBarnett/a-search', async () => {
    const posts = [];
    const fetchMock = async (url, init) => {
      posts.push({
        url: String(url),
        body: JSON.parse(String(init && init.body)),
      });
      return { status: 200, text: async () => 'ok' };
    };

    const r1 = await reportSelftestFailure({
      provider: 'ebay',
      env: 'live',
      error: 'browse_api_unreachable',
      latencyMs: 12,
      fetch: fetchMock,
    });
    assert.equal(r1.ok, true);
    assert.equal(r1.skipped, undefined);
    assert.equal(posts.length, 1);
    assert.match(posts[0].url, /irc\.ntsa\.uk\/bob\/v1\/intake/);
    assert.equal(posts[0].body.repo, DEFAULT_REPO);
    assert.equal(posts[0].body.repo, 'SimonBarnett/a-search');
    assert.equal(posts[0].body.kind, 'issue');
    assert.match(posts[0].body.title, /ebay/);
    assert.match(posts[0].body.body, /browse_api_unreachable/);
    assert.equal(
      posts[0].body.idempotency_key,
      selftestIdempotencyKey({
        provider: 'ebay',
        env: 'live',
        error: 'browse_api_unreachable',
      }),
    );
  });

  it('second identical failure is deduped (no second POST)', async () => {
    const posts = [];
    const fetchMock = async (_url, init) => {
      posts.push(JSON.parse(String(init && init.body)));
      return { status: 200, text: async () => 'ok' };
    };

    await reportSelftestFailure({
      provider: 'ebay',
      env: 'live',
      error: 'browse_api_unreachable',
      fetch: fetchMock,
    });
    const r2 = await reportSelftestFailure({
      provider: 'ebay',
      env: 'live',
      error: 'browse_api_unreachable',
      fetch: fetchMock,
    });
    assert.equal(posts.length, 1);
    assert.equal(r2.skipped, true);
  });

  it('reportSelftestFailures only files ok=false rows and redacts secrets', async () => {
    const posts = [];
    const {
      selftestBearerSecret,
      fakeJwtHeaderShort,
      reLiteral,
    } = require('./fixtures/fakeSecrets');
    const secret = selftestBearerSecret();
    const fetchMock = async (_url, init) => {
      posts.push(JSON.parse(String(init && init.body)));
      return { status: 200, text: async () => 'ok' };
    };

    const { intakeFiled } = await reportSelftestFailures({
      env: 'sandbox',
      fetch: fetchMock,
      providers: [
        { ok: true, source: 'amazon', latencyMs: 1 },
        {
          ok: false,
          source: 'cj',
          latencyMs: 3,
          error: `graphql_fail ${secret}`,
        },
      ],
    });
    assert.deepEqual(intakeFiled, ['cj']);
    assert.equal(posts.length, 1);
    assert.doesNotMatch(posts[0].body, reLiteral(fakeJwtHeaderShort()));
    assert.doesNotMatch(posts[0].title, reLiteral(fakeJwtHeaderShort()));
    assert.equal(posts[0].repo, 'SimonBarnett/a-search');
  });

  it('shared package lists selftest/ and docs mention reportSelftestFailure', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'shared', 'package.json'), 'utf8'),
    );
    assert.ok((pkg.files || []).includes('selftest/'));
    const docs = fs.readFileSync(
      path.join(root, 'docs', 'shared-layer.md'),
      'utf8',
    );
    assert.match(docs, /reportSelftestFailure/);
  });
});
