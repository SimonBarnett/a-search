'use strict';

/**
 * FR #4888: smoke-deploy signs POST /search + GET /selftest with IAM SigV4.
 * No JWT / Bearer. Mock fetch only (no live network or AWS).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'smoke-deploy.js');

const FAKE_CREDS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

function jsonResponse(status, body) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

describe('FR #4888 smoke-deploy IAM SigV4', () => {
  it('runSmoke sends AWS4-HMAC-SHA256 and no Bearer', async () => {
    const { runSmoke } = require(SCRIPT);
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url: String(url), init });
      if (String(url).endsWith('/search')) {
        return jsonResponse(200, {
          accepted: true,
          searchId: 'srch_iam_smoke',
        });
      }
      return jsonResponse(200, {
        ok: true,
        providers: [{ id: 'awin', ok: true }],
      });
    };
    const out = await runSmoke({
      fetchImpl,
      baseUrl: 'https://abc.execute-api.eu-west-2.amazonaws.com',
      credentials: FAKE_CREDS,
      now: () => new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    });
    assert.equal(out.ok, true);
    assert.equal(seen.length, 2);
    for (const row of seen) {
      const headers = row.init.headers || {};
      const auth = String(headers.Authorization || headers.authorization || '');
      assert.match(auth, /AWS4-HMAC-SHA256/);
      assert.doesNotMatch(auth, /Bearer/i);
      assert.ok(headers['X-Amz-Date'] || headers['x-amz-date']);
    }
    assert.equal(seen[0].init.method, 'POST');
    assert.match(seen[0].url, /\/search$/);
    assert.equal(seen[1].init.method, 'GET');
    assert.match(seen[1].url, /\/selftest/);
  });

  it('resolveSearchApiUrl uses DescribeStacks SearchApiUrl', async () => {
    const { resolveSearchApiUrl } = require(SCRIPT);
    const url = await resolveSearchApiUrl({
      stackName: 'ASearchStack',
      region: 'eu-west-2',
      describeStacks: async () => ({
        Stacks: [
          {
            Outputs: [
              {
                OutputKey: 'SearchApiUrl',
                OutputValue: 'https://xyz.execute-api.eu-west-2.amazonaws.com',
              },
            ],
          },
        ],
      }),
    });
    assert.equal(url, 'https://xyz.execute-api.eu-west-2.amazonaws.com');
  });

  it('CLI prints HTTP status on failure and never prints credentials', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--url', 'https://example.invalid'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        A_SEARCH_SMOKE_JWT: '',
        AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId,
        AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
        AWS_SESSION_TOKEN: '',
      },
    });
    assert.notEqual(r.status, 0);
    const blob = String(r.stdout || '') + String(r.stderr || '');
    assert.doesNotMatch(blob, /Bearer\s+\S{8,}/);
    assert.doesNotMatch(blob, /wJalrXUtnFEMI/);
    assert.doesNotMatch(blob, /A_SEARCH_SMOKE_JWT/);
  });

  it('guidSearch POST /search uses SigV4 and no agent key', async () => {
    const { createHttpPostSearch } = require(path.join(ROOT, 'redqueen', 'src', 'guidSearch'));
    const seen = [];
    const postSearch = createHttpPostSearch({
      A_SEARCH_API_URL: 'https://abc.execute-api.eu-west-2.amazonaws.com',
      AWS_ACCESS_KEY_ID: FAKE_CREDS.accessKeyId,
      AWS_SECRET_ACCESS_KEY: FAKE_CREDS.secretAccessKey,
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), init });
        return {
          ok: true,
          status: 200,
          async json() {
            return { searchid: 'srch_rq', queued: ['ebay'] };
          },
        };
      },
    });
    const out = await postSearch({
      hostkey: 'club.example',
      guid: 'guid-1',
      queries: [{ q: 'pads' }],
      exclude: [],
    });
    assert.equal(out.ok, true);
    assert.equal(seen.length, 1);
    const headers = seen[0].init.headers || {};
    assert.match(String(headers.Authorization || ''), /AWS4-HMAC-SHA256/);
    assert.equal(headers['x-agent-api-key'], undefined);
  });

  it('source and listed docs drop A_SEARCH_SMOKE_JWT', () => {
    const files = [
      'scripts/smoke-deploy.js',
      'scripts/smoke-selftest.js',
      'docs/deploy.md',
      'docs/release-checklist.md',
      'docs/endpoint-selftest.md',
      'docs/fr/FR-144.md',
      'docs/fr/FR-161.md',
      '.grok/skills/a-search-endpoint/SKILL.md',
      'cdk/lib/a-search-stack.js',
      'entry/src/index.js',
      'entry/src/auth/iam.js',
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.doesNotMatch(text, /A_SEARCH_SMOKE_JWT/, rel);
      assert.match(text, /SigV4|IAM|AWS4-HMAC-SHA256|execute-api/, rel);
    }
    const stack = fs.readFileSync(
      path.join(ROOT, 'cdk', 'lib', 'a-search-stack.js'),
      'utf8',
    );
    assert.match(stack, /fromUserName/);
    assert.match(stack, /a-search-redqueen-annotator/);
    assert.match(stack, /execute-api:Invoke/);
    const guid = fs.readFileSync(
      path.join(ROOT, 'redqueen', 'src', 'guidSearch.js'),
      'utf8',
    );
    assert.match(guid, /signExecuteApiRequest/);
    assert.doesNotMatch(guid, /x-agent-api-key/);
  });
});
