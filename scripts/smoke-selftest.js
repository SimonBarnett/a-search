#!/usr/bin/env node
'use strict';

/**
 * FR #4882: UAT S19 probe -- JWT GET then POST /selftest against SearchApiUrl.
 * Does not call POST /search (that is FR-144 smoke-deploy). Provider ok=false
 * rows are allowed; HTTP 200 + table shape is required.
 *
 *   node scripts/smoke-selftest.js --url https://xxxx.execute-api... --jwt "$TOKEN"
 *   A_SEARCH_API_URL=... A_SEARCH_SMOKE_JWT=... npm run smoke-selftest
 *
 * Never prints the JWT.
 */

const {
  normalizeBaseUrl,
  requireJwt,
  assertSelftestShape,
  resolveSmokeTarget,
} = require('./smoke-deploy.js');

function parseJson(text, status, verb) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `FR-4882: ${verb} /selftest HTTP ${status} non-JSON body (${String(text).slice(0, 120)})`,
    );
  }
}

async function fetchSelftest(fetchImpl, url, init, verb) {
  const res = await fetchImpl(url, init);
  const text = await res.text();
  const json = parseJson(text, res.status, verb);
  if (res.status !== 200) {
    throw new Error(
      `FR-4882: ${verb} /selftest expected HTTP 200, got ${res.status} ${JSON.stringify(json)}`,
    );
  }
  assertSelftestShape(json);
  return json;
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   baseUrl: string,
 *   jwt: string,
 * }} opts
 */
async function runSelftestSmoke(opts) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('FR-4882: fetch is not available');
  }
  const base = normalizeBaseUrl(opts.baseUrl);
  const jwt = requireJwt(opts.jwt);
  const auth = { Authorization: 'Bearer ' + jwt };

  const getJson = await fetchSelftest(
    fetchImpl,
    base + '/selftest?sandbox=true',
    { method: 'GET', headers: { ...auth, Accept: 'application/json' } },
    'GET',
  );
  const postJson = await fetchSelftest(
    fetchImpl,
    base + '/selftest',
    {
      method: 'POST',
      headers: {
        ...auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sandbox: true }),
    },
    'POST',
  );

  return {
    ok: true,
    selftestOk: Boolean(getJson.ok && postJson.ok),
    providers: Array.isArray(getJson.providers) ? getJson.providers.length : 0,
  };
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return undefined;
}

async function main() {
  const { baseUrl, region } = resolveSmokeTarget({
    url: argValue('--url'),
    region: argValue('--region'),
  });
  const jwt = argValue('--jwt') || process.env.A_SEARCH_SMOKE_JWT;
  const result = await runSelftestSmoke({ baseUrl, jwt });
  if (region) result.region = region;
  process.stdout.write(JSON.stringify(result) + '\n');
}

module.exports = {
  runSelftestSmoke,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(
      (err && err.message ? err.message : String(err)) + '\n',
    );
    process.exit(1);
  });
}
